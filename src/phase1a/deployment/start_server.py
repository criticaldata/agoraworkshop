"""Run on NVIDIA: start only AGORA services, fail closed on changed deployment.
No GPU is reserved until an authenticated inference request acquires the lease.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

root = Path('/data/PROJECTS/simon/agora-pilot')
config = json.loads((root/'deployment.json').read_text())
engine = root/'runtime/bin/ollama'
for path, checksum in [(engine, config['engine_sha256']), (root/'gateway.py', config['gateway_sha256'])]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != checksum: raise RuntimeError('Deployment source/binary changed')
uuid = subprocess.check_output(['nvidia-smi','-i',str(config['gpu_index']),'--query-gpu=uuid','--format=csv,noheader'],text=True).strip()
if uuid != config['gpu_uuid']: raise RuntimeError('GPU identity changed')
credential = (root/'gateway.credential').read_text().strip()
headers = {'Authorization': 'Bearer '+credential}

def get(url, headers={}):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=5) as r: return json.load(r)

def alive(name, expected):
    file = root/(name+'.pid')
    if not file.exists(): return False
    pid = int(file.read_text())
    try: command = Path(f'/proc/{pid}/cmdline').read_bytes().replace(b'\0',b' ').decode()
    except FileNotFoundError: return False
    if str(expected) not in command: raise RuntimeError('PID reused; operator reconciliation required')
    return True

def start(name, args, env=None):
    with open(root/(name+'-startup.log'), 'ab') as log:
        process = subprocess.Popen(args, env=env, cwd=root, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    (root/(name+'.pid')).write_text(str(process.pid))

os.umask(0o077)
if not alive('ollama', engine):
    env = dict(os.environ, OLLAMA_HOST='127.0.0.1:18501', OLLAMA_MODELS=str(root/'models'), CUDA_VISIBLE_DEVICES=uuid, OLLAMA_CONTEXT_LENGTH='32768', OLLAMA_NUM_PARALLEL='1', OLLAMA_MAX_LOADED_MODELS='1', OLLAMA_KEEP_ALIVE='0', OLLAMA_NO_CLOUD='1', OLLAMA_FLASH_ATTENTION='1', OLLAMA_KV_CACHE_TYPE='f16')
    start('ollama', [str(engine),'serve'], env)
for _ in range(30):
    try:
        version = get(config['backend_url']+'/api/version')['version']; break
    except OSError: time.sleep(1)
else: raise RuntimeError('Backend failed to start')
if version != config['engine_version']: raise RuntimeError('Backend version mismatch')
if not alive('gateway', root/'gateway.py'):
    start('gateway', ['python3',str(root/'gateway.py'),'--config',str(root/'deployment.json'),'--credential-file',str(root/'gateway.credential')])
for _ in range(30):
    try: health = get('http://127.0.0.1:18500/health', headers); break
    except OSError: time.sleep(1)
else: raise RuntimeError('Gateway failed to start or is halted; reconcile existing operation before restart')
expected = 'sha256:'+hashlib.sha256(json.dumps(config,sort_keys=True,separators=(',',':')).encode()).hexdigest()
if health['config_hash'] != expected or health['halted'] is not None: raise RuntimeError('Gateway health/configuration mismatch')
print(json.dumps({'service':'agora-pilot', 'healthy':True, 'config_hash':expected, 'gpu_allocated_by_startup':False}))
