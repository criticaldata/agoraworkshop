"""Retrieve and verify an encrypted AGORA archive entirely on the recovery VPS.
The SSH credential permits only backup reads. Decryption happens in private storage.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tarfile
import tempfile

from backup import hashes
from recovery_export import NAME


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def restore_files(archive_path, destination, expected):
    if not isinstance(expected, dict) or not expected:
        raise ValueError('Missing expected file hashes')
    seen = set()
    with tarfile.open(archive_path) as archive:
        for member in archive:
            path = destination / member.name
            if member.name not in expected or member.name in seen or not member.isfile() or destination.resolve() not in path.resolve().parents:
                raise ValueError('Unsafe, duplicate or unexpected archive member')
            seen.add(member.name)
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_bytes(archive.extractfile(member).read())
    if hashes(destination) != expected:
        raise ValueError('Restored file hashes differ from the backup manifest')


def recover(args):
    os.umask(0o077)
    if platform.system() != 'Linux':
        raise ValueError('Run off-Mac recovery on the Linux recovery host')
    if not NAME.fullmatch(args.archive) or args.archive.endswith('.json'):
        raise ValueError('Expected an AGORA ciphertext filename')
    identity = Path(args.identity).resolve()
    if not identity.is_file() or identity.stat().st_mode & 0o077:
        raise ValueError('Private recovery identity must have mode 0600')
    ssh_config = Path(args.ssh_config).resolve()
    verifier = Path(args.verifier).resolve()
    ssh = ['ssh', '-F', str(ssh_config), '-T', '-o', 'BatchMode=yes', 'agora-backups']
    def fetch(name, target):
        with target.open('wb') as output:
            subprocess.run(ssh + ['get ' + name], stdout=output, check=True, timeout=180)
    with tempfile.TemporaryDirectory(prefix='agora-vps-restore-') as temp:
        temp = Path(temp)
        manifest, cipher, plain = temp/'manifest.json', temp/'archive.age', temp/'archive.tar.gz'
        fetch(args.archive + '.manifest.json', manifest)
        expected = json.loads(manifest.read_text())
        fetch(args.archive, cipher)
        if digest(cipher) != expected['remote_ciphertext_sha256']:
            raise ValueError('Ciphertext checksum mismatch')
        subprocess.run([args.age, '-d', '-i', str(identity), '-o', str(plain), str(cipher)], check=True)
        destination = Path(args.destination).resolve() if args.destination else temp/'restored'
        destination.mkdir(mode=0o700, parents=True, exist_ok=False)
        restore_files(plain, destination, expected['files'])
        bundles = sorted(destination.glob('*-evidence.json'))
        calls = 0
        for bundle in bundles:
            result = subprocess.run(['node', 'dist/phase1a/wp06/cli.js', str(bundle)], cwd=verifier, check=True, capture_output=True, text=True)
            analysis = json.loads(result.stdout)
            if not (analysis.get('valid') or analysis.get('integrity', {}).get('valid')):
                raise ValueError('Restored evidence failed WP06 verification')
            calls += len(json.loads(bundle.read_text())['provider_calls'])
        if not bundles:
            raise ValueError('No evidence bundles found')
        source_hash = subprocess.run(['node', '--input-type=module', '-e', "import {implementationHash} from './dist/phase1a/experiment/provenance.js'; console.log(implementationHash())"], cwd=verifier, check=True, capture_output=True, text=True).stdout.strip()
        report = {
            'result': 'pass', 'mode': 'off_mac_encrypted_backup_restore',
            'verified_at': datetime.now(timezone.utc).isoformat(),
            'recovery_host': 'denem-server', 'observed_hostname': platform.node(),
            'operator_mac_required': False, 'retrieval': 'direct_VPS_to_NVIDIA_restricted_SSH',
            'archive': args.archive, 'remote_ciphertext_sha256': digest(cipher),
            'manifest_sha256': digest(manifest), 'byte_identical': True,
            'verified_bundles': len(bundles), 'verified_calls': calls,
            'independent_restore_processes': True, 'verifier_implementation_hash': source_hash,
            'recovery_script_sha256': digest(__file__), 'ssh_config_sha256': digest(ssh_config),
            'identity_mode': oct(identity.stat().st_mode & 0o777),
            'recipient': expected['recipient'],
            'restored_plan_hash': json.loads((destination/'plan.json').read_text())['plan_hash'],
            'plaintext_retained': bool(args.destination),
        }
    output = Path(args.report).resolve()
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2)+'\n')
    output.chmod(0o600)
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive'); parser.add_argument('report')
    parser.add_argument('--identity', default=str(Path.home()/'.config/agora-pilot/backup.identity'))
    parser.add_argument('--ssh-config', default=str(Path.home()/'.config/agora-pilot/recovery_ssh_config'))
    parser.add_argument('--age', default=str(Path.home()/'.local/share/agora-recovery/tools/age-runtime/usr/bin/age'))
    parser.add_argument('--verifier', default=str(Path.home()/'.local/share/agora-recovery/verifier'))
    parser.add_argument('--destination', help='Optional new private directory to retain verified recovered data')
    recover(parser.parse_args())
