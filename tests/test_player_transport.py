import json
from pathlib import Path
import platform
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).parents[1] / 'deploy/pi-live'
sys.path.insert(0, str(SOURCE))
import player_transport as TRANSPORT
from player_release import build, openssl


class PlayerTransportTests(unittest.TestCase):
    def test_insecure_endpoints_and_redirects_are_rejected(self):
        for url in ('http://example.test/file', 'file:///etc/passwd', 'https://user:secret@example.test/file'):
            with self.assertRaises(ValueError):
                TRANSPORT.fetch(url, 10, 'never-send')
        self.assertIsNone(TRANSPORT.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test'))
        with self.assertRaises(ValueError):
            TRANSPORT.endpoint({'statusUrl': 'https://example.test/status?token=secret'})

    def test_interrupted_download_leaves_active_player_and_no_partial_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'releases').mkdir()
            (root / 'current').symlink_to('releases/working')
            with patch.object(TRANSPORT, 'fetch', side_effect=OSError('offline')):
                with self.assertRaises(OSError):
                    TRANSPORT.download({'release': 'new', 'bundleUrl': 'https://releases.example/new/'}, root, root / 'public')
            self.assertEqual((root / 'current').readlink(), Path('releases/working'))
            self.assertEqual(list((root / 'releases').iterdir()), [])
            self.assertFalse(list(root.glob('.download-*')))

    def test_signed_download_has_no_device_credentials_and_detects_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            private, public = directory / 'private', directory / 'public'
            openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', private)
            openssl('pkey', '-in', private, '-pubout', '-out', public)
            bundle, root = directory / 'bundle', directory / 'root'
            (root / 'releases').mkdir(parents=True)
            build(SOURCE, bundle, 'release1', private, platform.machine())
            command = {'release': 'release1', 'bundleUrl': 'https://releases.example/release1/'}
            def fetch(url, limit, token=None, body=None):
                self.assertIsNone(token)
                self.assertIsNone(body)
                return (bundle / url.rsplit('/', 1)[1]).read_bytes()
            with patch.object(TRANSPORT, 'fetch', side_effect=fetch):
                self.assertEqual(TRANSPORT.download(command, root, public), 'release1')
                self.assertEqual(TRANSPORT.download(command, root, public), 'release1')
                (bundle / 'player.html').write_text('tampered')
                with self.assertRaisesRegex(ValueError, 'integrity'):
                    TRANSPORT.download(command, root, public)
            self.assertEqual((root / 'releases/release1/player.html').read_bytes(), (SOURCE / 'player.html').read_bytes())

    def test_completed_command_is_acknowledged_without_downloading_again(self):
        settings = {'statusUrl': 'https://control.example/devices/bar-tv/status', 'statusToken': 'credential'}
        command = {'request': 'req1', 'release': 'release1', 'bundleUrl': 'https://releases.example/release1/'}
        with patch.object(TRANSPORT, 'fetch', return_value=json.dumps({'request': command}).encode()), patch.object(TRANSPORT, 'report') as report, patch.object(TRANSPORT, 'download') as download:
            TRANSPORT.poll(settings, Path('/unused'), Path('/unused/key'), {'active': 'release1', 'lastRequest': 'req1'})
            download.assert_not_called()
            report.assert_called_once_with(settings, 'req1', 'complete', 'release1')

    def test_malformed_commands_do_not_crash_with_unhandled_type_errors(self):
        settings = {'statusUrl': 'https://control.example/devices/bar-tv/status', 'statusToken': 'credential'}
        for body in ([], {'request': 123}, {'request': {'request': '../escape', 'release': 'v1', 'bundleUrl': 'https://example.test/'}}):
            with patch.object(TRANSPORT, 'fetch', return_value=json.dumps(body).encode()):
                with self.assertRaises(ValueError):
                    TRANSPORT.poll(settings, Path('/unused'), Path('/unused/key'), {'active': 'old'})
