import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tarfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).parents[1] / 'deploy/pi-live'
sys.path.insert(0, str(SOURCE))
import bootstrap_install as BOOT
import player_release as RELEASE
spec = importlib.util.spec_from_file_location('build_bootstrap', SOURCE.parents[1] / 'scripts/build-updater-bootstrap.py')
BUILD = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BUILD)


@unittest.skipUnless(shutil.which('openssl'), 'OpenSSL required')
class BootstrapInstallationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keys = tempfile.TemporaryDirectory()
        cls.private = Path(cls.keys.name) / 'private.pem'
        cls.public = Path(cls.keys.name) / 'public.pem'
        subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(cls.private)], check=True, capture_output=True)
        subprocess.run(['openssl', 'pkey', '-in', str(cls.private), '-pubout', '-out', str(cls.public)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.keys.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.release = self.directory / 'release'
        RELEASE.build(SOURCE, self.release, 'fixture-release', self.private)
        self.payload = self.directory / 'package'
        BUILD.build(self.release, self.public, self.payload)
        self.root = self.directory / 'root'
        self.events = []
        self.installer = BOOT.Installer(self.root, self.events.append, (os.getuid(), os.getgid()), ready=lambda started: None)
        for name in BOOT.SOFTWARE:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('original ' + name)
        (self.root / BOOT.SOFTWARE[-1]).write_text('[Service]\nUser=opencourt\nExecStart=/usr/bin/cage -- /usr/local/bin/opencourt-launch-local\n')
        config = {'schemaVersion': 1, 'deviceId': 'opencourt-kitchen', 'revision': 25,
                  'source': {'type': 'image', 'url': 'honours.png', 'expectedWidth': 3840, 'expectedHeight': 2160}}
        (self.root / BOOT.SETTINGS[0]).write_text(json.dumps(config))
        (self.root / BOOT.SETTINGS[1]).write_text('{"statusToken":"fixture-secret","deviceId":"opencourt-kitchen"}')
        png = b'\x89PNG\r\n\x1a\n' + b'\0' * 8 + (3840).to_bytes(4, 'big') + (2160).to_bytes(4, 'big')
        (self.root / 'var/lib/opencourt/honours.png').write_bytes(png)
        self.original = {name: (self.root / name).read_bytes() for name in (*BOOT.SOFTWARE, *BOOT.SETTINGS)}
        self.machine = patch.object(RELEASE.platform, 'machine', return_value='aarch64')
        self.machine.start()
        self.addCleanup(self.machine.stop)

    def test_install_and_restore_preserve_live_content_credentials_and_base_service(self):
        self.installer.install(self.payload)
        self.assertEqual(self.events, ['stop', 'reload', 'start'])
        self.assertTrue((self.root / BOOT.SOFTWARE[0]).is_symlink())
        self.assertIn('TimeoutStopSec=25', (self.root / BOOT.DROPIN).read_text())
        for name in BOOT.SETTINGS:
            self.assertEqual((self.root / name).read_bytes(), self.original[name])
        self.assertEqual((self.installer.backup / 'before.tar').stat().st_mode & 0o777, 0o600)
        # Model legitimate new settings after software installation, then recover.
        for name in BOOT.SETTINGS:
            (self.root / name).write_text('new live state')
        self.installer.restore()
        for name in BOOT.SOFTWARE:
            self.assertEqual((self.root / name).read_bytes(), self.original[name])
        for name in BOOT.SETTINGS:
            self.assertEqual((self.root / name).read_text(), 'new live state')
        self.assertFalse((self.root / BOOT.DROPIN).exists())
        self.assertFalse(self.installer.base.exists())
        self.assertTrue((self.installer.backup / 'retired-software').is_dir())

    def test_corrupt_package_and_unsupported_system_never_stop_kiosk(self):
        file = self.payload / 'initial-release/player.html'
        original = file.read_bytes()
        file.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.installer.install(self.payload)
        self.assertFalse(self.installer.backup.exists())
        self.assertEqual(self.events, [])
        file.write_bytes(original)
        with patch.object(RELEASE, 'check_compatibility', side_effect=ValueError('Unsupported Chromium')):
            with self.assertRaisesRegex(ValueError, 'Unsupported Chromium'):
                self.installer.install(self.payload)
        self.assertFalse(self.installer.backup.exists())
        self.assertEqual(self.events, [])

    def test_failed_service_start_restores_original_software(self):
        failed = False
        def service(action):
            nonlocal failed
            self.events.append(action)
            if action == 'start' and not failed:
                failed = True
                raise RuntimeError('simulated start failure')
        self.installer.service = service
        with self.assertRaisesRegex(RuntimeError, 'start failure'):
            self.installer.install(self.payload)
        for name, value in self.original.items():
            self.assertEqual((self.root / name).read_bytes(), value)
        self.assertFalse((self.root / BOOT.DROPIN).exists())
        self.assertEqual(self.events[-1], 'start')

    def test_missing_startup_health_restores_original_software(self):
        def fail(started):
            raise TimeoutError('no fresh health')
        self.installer.ready = fail
        with self.assertRaisesRegex(TimeoutError, 'fresh health'):
            self.installer.install(self.payload)
        for name, value in self.original.items():
            self.assertEqual((self.root / name).read_bytes(), value)
        self.assertFalse((self.root / BOOT.DROPIN).exists())
        self.assertEqual(self.events[-1], 'start')

    def test_startup_readiness_rejects_old_heartbeat_and_accepts_live_process(self):
        self.installer.install(self.payload)
        health = self.installer.base / 'player-health.json'
        health.write_text(json.dumps({'pid': os.getpid(), 'monotonic': 50}))
        with patch.object(BOOT.time, 'monotonic', side_effect=[100, 101, 102, 200]), patch.object(BOOT.time, 'sleep'):
            with self.assertRaises(TimeoutError):
                self.installer.wait_ready(100)
        health.write_text(json.dumps({'pid': os.getpid(), 'monotonic': 101}))
        with patch.object(BOOT.time, 'monotonic', side_effect=[100, 101, 102]):
            self.installer.wait_ready(100)

    def test_missing_current_image_and_existing_backup_fail_before_changes(self):
        image = self.root / 'var/lib/opencourt/honours.png'
        image.unlink()
        with self.assertRaises(ValueError):
            self.installer.install(self.payload)
        self.assertFalse(self.installer.backup.exists())
        self.assertEqual(self.events, [])
        image.write_bytes(b'bad image')
        self.installer.backup.mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.installer.install(self.payload)
        self.assertEqual(self.events, [])

    def test_corrupt_recovery_backup_is_rejected_before_stopping(self):
        self.installer.install(self.payload)
        self.events.clear()
        hashes = self.installer.backup / 'before-sha256.json'
        value = json.loads(hashes.read_text())
        value[BOOT.SOFTWARE[0]] = '0' * 64
        hashes.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, 'integrity'):
            self.installer.restore()
        self.assertEqual(self.events, [])
        self.assertTrue((self.root / BOOT.SOFTWARE[0]).is_symlink())

    def test_automatic_restore_uses_original_software_ownership(self):
        self.installer.install(self.payload)
        archive = self.installer.backup / 'before.tar'
        with tarfile.open(archive) as tar:
            entries = [(member, tar.extractfile(member).read()) for member in tar.getmembers()]
        import io
        with tarfile.open(archive, 'w') as tar:
            for member, data in entries:
                member.uid = member.gid = 0
                tar.addfile(member, io.BytesIO(data))
        with patch.object(BOOT.os, 'chown') as chown:
            self.installer.restore()
        self.assertEqual(len(chown.call_args_list), len(BOOT.SOFTWARE))
        self.assertTrue(all(call.args[1:] == (0, 0) for call in chown.call_args_list))

    def test_package_is_reproducible_and_contains_no_private_key_or_device_settings(self):
        other = self.directory / 'other/package'
        result = BUILD.build(self.release, self.public, other)
        self.assertEqual(Path(result['archive']).read_bytes(), self.payload.with_suffix('.tar.gz').read_bytes())
        names = {p.name for p in self.payload.rglob('*')}
        self.assertFalse({'remote.json', 'device-config.json', 'private.pem'} & names)
        self.assertEqual(len(list((self.payload / 'initial-release').iterdir())), 4)


if __name__ == '__main__':
    unittest.main()
