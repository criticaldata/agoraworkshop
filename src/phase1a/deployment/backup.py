"""Encrypt a stopped local campaign, copy to NVIDIA, retrieve and verify restoration.
No plaintext or private identity is uploaded. Refuses active runners and symlinks.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def hashes(root):
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink(): raise ValueError('Symlinks are not allowed in archives')
        if path.is_file(): result[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def backup(source, identity, output):
    source, identity, output = Path(source).resolve(), Path(identity).resolve(), Path(output).resolve()
    if not identity.exists() or identity.stat().st_mode & 0o077: raise ValueError('Private age identity must exist with mode 0600')
    if any(p.name.endswith('.lock') for p in source.iterdir()): raise ValueError('Runner lock present; stop and reconcile before backup')
    before = hashes(source)
    if not before: raise ValueError('Empty archive')
    recipient = run(['age-keygen', '-y', str(identity)], text=True).stdout.strip()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    filename = f'agora-{stamp}.tar.gz.age'
    remote = '/data/PROJECTS/simon/agora-pilot/backups/' + filename
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='agora-restore-') as temp:
        temp = Path(temp).resolve()
        plain, cipher, retrieved = temp/'source.tar.gz', temp/filename, temp/'retrieved.age'
        with tarfile.open(plain, 'w:gz') as archive:
            for name in before: archive.add(source/name, arcname=name, recursive=False)
        if before != hashes(source): raise RuntimeError('Archive changed during snapshot')
        run(['age', '-r', recipient, '-o', str(cipher), str(plain)])
        run(['ssh', '-T', '-o', 'BatchMode=yes', 'mit-critical-data-1', 'mkdir -p -m 700 /data/PROJECTS/simon/agora-pilot/backups'])
        run(['scp', '-q', str(cipher), 'mit-critical-data-1:'+remote])
        remote_hash = run(['ssh', '-T', '-o', 'BatchMode=yes', 'mit-critical-data-1', 'sha256sum '+remote], text=True).stdout.split()[0]
        digest = hashlib.sha256(cipher.read_bytes()).hexdigest()
        if remote_hash != digest: raise RuntimeError('Remote backup checksum mismatch')
        run(['scp', '-q', 'mit-critical-data-1:'+remote, str(retrieved)])
        if hashlib.sha256(retrieved.read_bytes()).hexdigest() != digest: raise RuntimeError('Retrieved ciphertext checksum mismatch')
        decrypted, restored = temp/'restored.tar.gz', temp/'restored'
        run(['age', '-d', '-i', str(identity), '-o', str(decrypted), str(retrieved)])
        restored.mkdir(mode=0o700)
        with tarfile.open(decrypted) as archive:
            for member in archive.getmembers():
                if member.name not in before or not member.isfile(): raise RuntimeError('Unexpected archive member')
                destination = restored/member.name
                if restored not in destination.resolve().parents: raise RuntimeError('Unsafe archive path')
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                destination.write_bytes(archive.extractfile(member).read())
        if hashes(restored) != before: raise RuntimeError('Restored bytes differ')
        # Fresh Node processes reconstruct and validate each evidence bundle with WP06.
        bundles = sorted(restored.glob('*-evidence.json'))
        for bundle in bundles:
            result = json.loads(run(['node', 'dist/phase1a/wp06/cli.js', str(bundle)], text=True).stdout)
            if not result.get('valid', False):
                # WP06 reports validity under integrity, see analyzer schema.
                if not result.get('integrity', {}).get('valid', False): raise RuntimeError('Restored evidence failed verification')
        roster = json.loads((restored/'roster.json').read_text())
        report = {'mode': 'automated_encrypted_backup_restore', 'result': 'pass', 'verified_at': datetime.now(timezone.utc).isoformat(), 'source': str(source), 'remote_ciphertext': 'mit-critical-data-1:'+remote, 'remote_ciphertext_sha256': digest, 'recipient': recipient, 'byte_identical': True, 'separate_process': True, 'verified_bundles': len(bundles), 'verified_calls': sum(len(json.loads(p.read_text()).get('provider_calls', [])) for p in bundles), 'files': before}
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        manifest = temp/'manifest.json'
        manifest.write_text(json.dumps(report, indent=2)+'\n')
        # Publish non-secret checksum metadata for independent VPS retrieval.
        manifest_remote = remote + '.manifest.json'
        run(['scp', '-q', str(manifest), 'mit-critical-data-1:' + manifest_remote])
        manifest_hash = run(['ssh', '-T', '-o', 'BatchMode=yes', 'mit-critical-data-1', 'sha256sum ' + manifest_remote], text=True).stdout.split()[0]
        if manifest_hash != hashlib.sha256(manifest.read_bytes()).hexdigest():
            raise RuntimeError('Remote recovery manifest checksum mismatch')
        output.write_bytes(manifest.read_bytes()); output.chmod(0o600)
        print(json.dumps({k:v for k,v in report.items() if k != 'files'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('source'); parser.add_argument('identity'); parser.add_argument('report')
    args = parser.parse_args(); backup(args.source, args.identity, args.report)
