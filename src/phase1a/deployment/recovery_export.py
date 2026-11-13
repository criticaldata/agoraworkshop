"""Forced SSH command: expose only AGORA ciphertext and its checksum manifests."""
import json
import os
from pathlib import Path
import re
import sys

BACKUPS = Path('/data/PROJECTS/simon/agora-pilot/backups')
NAME = re.compile(r'agora-[0-9]{8}T[0-9]{12}Z\.tar\.gz\.age(?:\.manifest\.json)?\Z')


def selected_file(root, name):
    if not NAME.fullmatch(name):
        raise ValueError('Invalid backup name')
    path = root / name
    if path.is_symlink() or not path.is_file() or path.resolve().parent != root.resolve():
        raise ValueError('Backup is unavailable')
    return path


def export(command, root=BACKUPS):
    if command == 'list':
        names = sorted(p.name for p in root.iterdir() if NAME.fullmatch(p.name) and p.is_file() and not p.is_symlink())
        print(json.dumps(names))
    elif command.startswith('get '):
        with selected_file(root, command[4:]).open('rb') as source:
            while chunk := source.read(1024 * 1024):
                sys.stdout.buffer.write(chunk)
    else:
        raise ValueError('Only list and get of AGORA backups are allowed')


if __name__ == '__main__':
    try:
        export(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
