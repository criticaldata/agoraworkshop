"""Private AGORA/Ollama bridge. Standard library only; one GPU lease per request."""
import argparse
import contextlib
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def digest(value):
    return 'sha256:' + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def backend(url, path, payload=None, timeout=180):
    req = urllib.request.Request(url + path, data=None if payload is None else json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


class GPUReservation:
    def __init__(self, path, index, owner):
        self.path, self.index, self.owner = Path(path), str(index), owner

    def memory_used(self):
        r = subprocess.run(['nvidia-smi', '-i', self.index, '--query-gpu=memory.used', '--format=csv,noheader,nounits'], capture_output=True, text=True, check=True, timeout=10)
        return int(r.stdout.strip())

    def change(self, acquire):
        with open(str(self.path) + '.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            original = self.path.read_text()
            rows = original.splitlines(keepends=True)
            matches = [i for i, row in enumerate(rows) if re.match(r'^\s*' + re.escape(self.index) + r'\s+', row)]
            if len(matches) != 1:
                raise RuntimeError('GPU reservation row missing or duplicated')
            i = matches[0]
            fields = rows[i].split()
            if acquire:
                if fields[1] != 'free' or self.memory_used() > 64:
                    raise RuntimeError('GPU unavailable in lease file or device usage')
                rows[i] = f'{self.index}    busy   {self.owner}   {os.getpid()}   {time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())} AGORA isolated inference; auto-release after unload\n'
            else:
                if fields[1] != 'busy' or fields[2] != self.owner or fields[3] != str(os.getpid()):
                    raise RuntimeError('GPU reservation ownership changed; refusing to overwrite')
                if self.memory_used() > 64:
                    raise RuntimeError('GPU still occupied; retain reservation for investigation')
                rows[i] = f'{self.index}    free   -          -         -                    -\n'
            if self.path.read_text() != original:
                raise RuntimeError('Concurrent lease file modification')
            fd, name = tempfile.mkstemp(prefix='GPUS.agora.', dir=self.path.parent)
            try:
                os.fchmod(fd, self.path.stat().st_mode & 0o777)
                with os.fdopen(fd, 'w') as out:
                    out.write(''.join(rows)); out.flush(); os.fsync(out.fileno())
                os.replace(name, self.path)
            finally:
                if os.path.exists(name): os.unlink(name)


class Bridge:
    def __init__(self, config, reservation=None):
        self.config = config
        self.config_hash = digest(config)
        self.lock = threading.Lock()
        self.reservation = reservation or GPUReservation(config['lease_file'], config['gpu_index'], config['lease_owner'])
        self.halted = None

    def translate(self, request):
        allowed = {'model', 'messages', 'temperature', 'top_p', 'max_tokens', 'seed', 'stream', 'n'}
        if set(request) - allowed or request.get('stream', False) is not False or request.get('n', 1) != 1:
            raise ValueError('Unsupported request option')
        model = request.get('model')
        if model not in self.config['models']: raise ValueError('Model not in approved deployment')
        messages = request.get('messages')
        if not isinstance(messages, list) or not messages: raise ValueError('Messages required')
        for message in messages:
            if set(message) != {'role', 'content'} or message['role'] not in ['system', 'user', 'assistant'] or not isinstance(message['content'], str):
                raise ValueError('Only text chat messages are supported')
        tokens = request.get('max_tokens')
        if type(tokens) is not int or not 1 <= tokens <= 1024: raise ValueError('Output budget out of bounds')
        if request.get('temperature') != 0.7 or request.get('top_p') != 1: raise ValueError('Sampling parameters differ from deployment')
        options = {'num_ctx': self.config['context_window'], 'num_predict': tokens, 'temperature': 0.7, 'top_p': 1, 'top_k': 0, 'repeat_penalty': 1}
        if 'seed' in request:
            if type(request['seed']) is not int: raise ValueError('Invalid seed')
            options['seed'] = request['seed']
        return {'model': model, 'messages': messages, 'stream': False, 'think': False, 'truncate': False, 'shift': False, 'keep_alive': 0, 'options': options}

    def invoke(self, request):
        payload = self.translate(request)
        if not self.lock.acquire(blocking=False): return 429, {'error': 'AGORA request already in progress'}
        acquired = False
        try:
            if self.halted: return 503, {'error': self.halted}
            tags = backend(self.config['backend_url'], '/api/tags')['models']
            known = {m['name']: 'sha256:' + m['digest'] for m in tags}
            model = payload['model']
            if known.get(model) != self.config['models'][model]['manifest_digest']:
                return 409, {'error': 'Model manifest changed; deployment must be revalidated'}
            try: self.reservation.change(True); acquired = True
            except RuntimeError as error: return 429, {'error': str(error)}
            try:
                data = backend(self.config['backend_url'], '/api/chat', payload)
            except urllib.error.HTTPError as error:
                # Return controlled failure without echoing arbitrary backend error bodies.
                return error.code if error.code in [400, 413] else 502, {'error': 'Ollama rejected the request; no fallback or truncation'}
            except Exception:
                self.halted = 'Ambiguous backend completion; operator reconciliation required'
                return 502, {'error': self.halted}
            usage = {'prompt_tokens': data.get('prompt_eval_count'), 'completion_tokens': data.get('eval_count')}
            if data.get('model') != model or data.get('done') is not True or any(type(v) is not int or v < 0 for v in usage.values()):
                self.halted = 'Invalid identity, completion state or token accounting'
                return 502, {'error': self.halted}
            message = data.get('message', {})
            if message.get('thinking') or message.get('tool_calls') or not isinstance(message.get('content'), str) or not message['content'].strip():
                return 502, {'error': 'Expected a visible answer with thinking and tools disabled'}
            usage['total_tokens'] = usage['prompt_tokens'] + usage['completion_tokens']
            return 200, {'id': f'agora-{time.time_ns()}', 'object': 'chat.completion', 'model': model,
                'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': message['content']}, 'finish_reason': data.get('done_reason')}],
                'usage': usage, 'agora_deployment': {'config_hash': self.config_hash, 'model_revision': known[model], 'effective_options': payload['options'], 'think': False, 'truncate': False, 'shift': False}}
        finally:
            if acquired:
                # Explicit unload also handles rejected contexts and response errors.
                try:
                    backend(self.config['backend_url'], '/api/generate', {'model': payload['model'], 'keep_alive': 0}, timeout=180)
                    deadline = time.monotonic() + 20
                    while self.reservation.memory_used() > 64 and time.monotonic() < deadline: time.sleep(0.25)
                    self.reservation.change(False)
                except Exception:
                    self.halted = 'GPU unload/release failed; reservation retained for operator reconciliation'
            self.lock.release()


def serve(config, port, credential):
    if config['gateway_sha256'] != hashlib.sha256(Path(__file__).read_bytes()).hexdigest(): raise RuntimeError('Gateway source checksum mismatch')
    bridge = Bridge(config)
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, value):
            data = json.dumps(value).encode()
            self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        def authorized(self):
            return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + credential)
        def do_GET(self):
            if not self.authorized(): return self.reply(403, {'error': 'Authentication required'})
            if self.path == '/health': self.reply(200 if not bridge.halted else 503, {'config_hash': bridge.config_hash, 'halted': bridge.halted})
            elif self.path == '/v1/models': self.reply(200, {'data': [{'id': model, 'object': 'model'} for model in config['models']]})
            else: self.reply(404, {'error': 'Not found'})
        def do_POST(self):
            if not self.authorized(): return self.reply(403, {'error': 'Authentication required'})
            if self.path != '/v1/chat/completions': return self.reply(404, {'error': 'Not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 2_000_000: return self.reply(413, {'error': 'Request too large or empty'})
                data = json.loads(self.rfile.read(size)); status, value = bridge.invoke(data); self.reply(status, value)
            except (ValueError, TypeError, KeyError): self.reply(400, {'error': 'Invalid request'})
            except Exception: self.reply(502, {'error': 'Deployment unavailable; inspect operator log'})
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--config', required=True); parser.add_argument('--port', type=int, default=18500); parser.add_argument('--credential-file', required=True)
    args = parser.parse_args(); serve(json.loads(Path(args.config).read_text()), args.port, Path(args.credential_file).read_text().strip())
