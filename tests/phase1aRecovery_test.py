import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src/phase1a/deployment'))
from recovery_export import selected_file, export
from recover import restore_files


class RecoverySafety(unittest.TestCase):
    def test_restricted_names_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            name = 'agora-20261113T040236447411Z.tar.gz.age'
            (root/name).write_bytes(b'cipher')
            self.assertEqual(selected_file(root, name), root/name)
            for bad in ['../backup.identity', '/etc/passwd', name+'; id', name+'\n', 'backup.identity']:
                with self.assertRaises(ValueError): selected_file(root, bad)
            (root/name).unlink(); (root/name).symlink_to('/etc/passwd')
            with self.assertRaises(ValueError): selected_file(root, name)

    def test_export_rejects_shell_and_write_commands(self):
        for command in ['', 'id', 'get ../backup.identity', 'scp -t anything', 'list; id']:
            with self.assertRaises(ValueError): export(command)

    def test_restores_only_manifest_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); target = root/'restored'; target.mkdir()
            archive = root/'archive.tar.gz'
            with tarfile.open(archive, 'w:gz') as out:
                info=tarfile.TarInfo('nested/data.json');info.size=2
                out.addfile(info, io.BytesIO(b'{}'))
            restore_files(archive, target, {'nested/data.json':hashlib.sha256(b'{}').hexdigest()})
            self.assertEqual((target/'nested/data.json').read_bytes(), b'{}')

    def test_rejects_traversal_links_duplicates_and_unexpected_files(self):
        for case in ['traversal','link','duplicate','unexpected']:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temp:
                root=Path(temp);target=root/'restored';target.mkdir();archive=root/'a.tar'
                name='../escape' if case=='traversal' else 'data'
                with tarfile.open(archive,'w') as out:
                    for _ in range(2 if case=='duplicate' else 1):
                        info=tarfile.TarInfo(name)
                        if case=='link': info.type=tarfile.SYMTYPE;info.linkname='../escape';out.addfile(info)
                        else: info.size=2;out.addfile(info,io.BytesIO(b'{}'))
                expected={name:hashlib.sha256(b'{}').hexdigest()} if case!='unexpected' else {'other':'0'*64}
                with self.assertRaises(ValueError):restore_files(archive,target,expected)
                self.assertFalse((root/'escape').exists())

    def test_missing_or_corrupt_files_fail_verification(self):
        for expected in [{'data':'0'*64}, {'data':hashlib.sha256(b'{}').hexdigest(),'missing':'0'*64}]:
            with tempfile.TemporaryDirectory() as temp:
                root=Path(temp);target=root/'restored';target.mkdir();archive=root/'a.tar'
                with tarfile.open(archive,'w') as out:
                    info=tarfile.TarInfo('data');info.size=2;out.addfile(info,io.BytesIO(b'{}'))
                with self.assertRaises(ValueError):restore_files(archive,target,expected)


if __name__ == '__main__':unittest.main()
