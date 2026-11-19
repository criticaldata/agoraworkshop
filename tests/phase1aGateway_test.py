import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('gateway', pathlib.Path(__file__).resolve().parents[1] / 'src/phase1a/deployment/gateway.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
CONFIG = {'backend_url': 'http://127.0.0.1:18501', 'context_window': 32768, 'models': {'qwen-test': {'manifest_digest': 'sha256:abc'}}}
REQUEST = {'model': 'qwen-test', 'messages': [{'role': 'system', 'content': 'instruction'}, {'role': 'user', 'content': 'question'}], 'temperature': .7, 'top_p': 1, 'max_tokens': 1024, 'n': 1, 'stream': False}
class FakeLease:
    def __init__(self): self.actions = []
    def change(self, acquire): self.actions.append(acquire)
    def memory_used(self): return 0
class GatewayTests(unittest.TestCase):
    def test_explicit_context_and_no_silent_truncation_or_thinking(self):
        payload = g.Bridge(CONFIG, FakeLease()).translate(REQUEST)
        self.assertEqual(payload['messages'], REQUEST['messages'])
        self.assertFalse(payload['truncate']); self.assertFalse(payload['shift']); self.assertFalse(payload['think'])
        self.assertEqual(payload['options']['num_ctx'], 32768)
        self.assertEqual(payload['options']['top_k'], 0)
        self.assertEqual(payload['options']['num_predict'], 1024)
    def test_rejects_unknown_models_and_tools(self):
        bridge = g.Bridge(CONFIG, FakeLease())
        for change in [{'model': 'other'}, {'tools': []}, {'max_tokens': 2048}, {'stream': True}]:
            with self.assertRaises(ValueError): bridge.translate({**REQUEST, **change})
    def test_pins_revision_before_gpu_acquisition(self):
        lease = FakeLease(); bridge = g.Bridge(CONFIG, lease)
        with patch.object(g, 'backend', return_value={'models': [{'name': 'qwen-test', 'digest': 'changed'}]}):
            self.assertEqual(bridge.invoke(REQUEST)[0], 409)
        self.assertEqual(lease.actions, [])
    def test_releases_after_success_and_keeps_usage(self):
        lease = FakeLease(); bridge = g.Bridge(CONFIG, lease)
        data = {'model': 'qwen-test', 'done': True, 'message': {'content': 'answer'}, 'done_reason': 'stop', 'prompt_eval_count': 12, 'eval_count': 3}
        with patch.object(g, 'backend', side_effect=[{'models': [{'name': 'qwen-test', 'digest': 'abc'}]}, data, {}]) as backend:
            status, result = bridge.invoke(REQUEST)
        self.assertEqual(status, 200); self.assertEqual(result['usage']['total_tokens'], 15)
        self.assertEqual(result['agora_deployment']['config_hash'], g.digest(CONFIG))
        self.assertEqual(lease.actions, [True, False])
        self.assertEqual(backend.call_args_list[-1].args[1], '/api/generate')
    def test_context_rejection_remains_failure_and_releases(self):
        lease = FakeLease(); bridge = g.Bridge(CONFIG, lease)
        with patch.object(g, 'backend', side_effect=[{'models': [{'name': 'qwen-test', 'digest': 'abc'}]}, g.urllib.error.HTTPError('test', 400, 'too long', {}, None), {}]):
            self.assertEqual(bridge.invoke(REQUEST)[0], 400)
        self.assertEqual(lease.actions, [True, False])
    def test_atomic_lease_preserves_other_rows_and_checks_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'GPUS.txt'
            path.write_text('# leases\n0 free - - - -\n1 busy other 99 today work\n')
            lease = g.GPUReservation(path, 0, 'agora-test')
            with patch.object(lease, 'memory_used', return_value=0):
                lease.change(True)
                with self.assertRaises(RuntimeError): lease.change(True)
                lease.change(False)
            self.assertIn('1 busy other 99 today work', path.read_text())
            with patch.object(lease, 'memory_used', return_value=100):
                with self.assertRaises(RuntimeError): lease.change(True)
if __name__ == '__main__': unittest.main()
