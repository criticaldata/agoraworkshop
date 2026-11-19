"""Local operator entry point. --run requires an already approved exact plan.
Credentials and the age identity stay outside the repository. No approval is added.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

parser = argparse.ArgumentParser(); parser.add_argument('plan'); parser.add_argument('--run',action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
os.chdir(root); os.umask(0o077)
plan_path = Path(args.plan).resolve()
# Fail before credential reads, tunnels or output creation if approval is absent.
subprocess.run(['npx','tsx','src/phase1a/experiment/cli.ts','check',str(plan_path)],check=True)
plan = json.loads(plan_path.read_text())
private = Path.home()/'.config/agora-pilot'
credential = (private/'gateway.credential').read_text().strip()
if not (private/'backup.identity').is_file(): raise RuntimeError('Backup identity missing')
env = dict(os.environ)
for endpoint in plan['endpoints']:
    if endpoint['expected_url'] != 'http://127.0.0.1:18500/v1/chat/completions': raise RuntimeError('Unexpected tunnel endpoint')
    env[endpoint['endpoint_ref'][4:]] = endpoint['expected_url']
    env[endpoint['credential_env']] = credential

def health():
    request = urllib.request.Request('http://127.0.0.1:18500/health',headers={'Authorization':'Bearer '+credential})
    with urllib.request.urlopen(request, timeout=5) as response: return json.load(response)

tunnel = None
try:
    try: status = health()
    except OSError:
        # Disable Brev multiplexing: a multiplexed forward was observed to disappear.
        tunnel = subprocess.Popen(['ssh','-S','none','-o','ControlMaster=no','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-T','-N','-L','127.0.0.1:18500:127.0.0.1:18500','mit-critical-data-1'])
        for _ in range(30):
            if tunnel.poll() is not None: raise RuntimeError('SSH tunnel failed')
            try: status = health(); break
            except OSError: time.sleep(1)
        else: raise RuntimeError('Tunnel did not become ready')
    if status['halted'] is not None or any(e.get('deployment_config_hash') != status['config_hash'] for e in plan['endpoints']): raise RuntimeError('Gateway differs from approved plan or requires reconciliation')
    if not args.run:
        print('Approved plan and deployment preflight passed; no model call sent.')
    else:
        archive = Path(plan['data_policy']['storage_location'])
        try:
            subprocess.run(['npx','tsx','src/phase1a/experiment/cli.ts','run',str(plan_path),str(archive)],env=env,check=True)
        finally:
            if archive.exists():
                subprocess.run(['python3','src/phase1a/deployment/backup.py',str(archive),str(private/'backup.identity'),str(archive.parent/(archive.name+'-backup-verification.json'))],check=True)
finally:
    if tunnel:
        tunnel.terminate()
        try: tunnel.wait(timeout=10)
        except subprocess.TimeoutExpired: tunnel.kill(); tunnel.wait()
