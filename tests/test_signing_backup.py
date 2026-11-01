import os
from pathlib import Path
import pty
import select
import shutil
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).parents[1] / 'scripts/player-signing-backup.sh'


@unittest.skipUnless(shutil.which('openssl'), 'OpenSSL required')
class SigningBackupTests(unittest.TestCase):
    def run_interactive(self, args, passphrase='fixture-only-passphrase'):
        pid, descriptor = pty.fork()
        if pid == 0:
            os.execvp('sh', ['sh', str(SCRIPT), *map(str, args)])
        prompts = 0
        deadline = time.monotonic() + 15
        buffer = b''
        try:
            while time.monotonic() < deadline:
                ready, _, _ = select.select([descriptor], [], [], .1)
                if ready:
                    try:
                        chunk = os.read(descriptor, 65536)
                    except OSError:
                        chunk = b''
                    buffer += chunk
                    # OpenSSL emits one password prompt at a time without a newline.
                    if b'pass phrase' in buffer.lower() and buffer.rstrip().endswith(b':'):
                        os.write(descriptor, (passphrase + '\n').encode())
                        prompts += 1
                        buffer = b''
                ended, status = os.waitpid(pid, os.WNOHANG)
                if ended:
                    self.last_output = buffer.decode(errors="replace")
                    return os.waitstatus_to_exitcode(status), prompts
            os.kill(pid, 9)
            os.waitpid(pid, 0)
            self.fail('Interactive key test timed out')
        finally:
            os.close(descriptor)

    def test_encrypted_backup_copy_recovers_expected_key_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private, public, backup = root / 'private.pem', root / 'public.pem', root / 'backup.pem'
            subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(private)], check=True, capture_output=True)
            subprocess.run(['openssl', 'pkey', '-in', str(private), '-pubout', '-out', str(public)], check=True, capture_output=True)
            original = private.read_bytes()
            args = ['create', '--private-key', private, '--public-key', public, '--output', backup]
            status, prompts = self.run_interactive(args)
            self.assertEqual(status, 0, self.last_output)
            self.assertEqual(prompts, 3)
            self.assertTrue(backup.read_bytes().startswith(b'-----BEGIN ENCRYPTED PRIVATE KEY-----'))
            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
            copied = root / 'second-copy.pem'
            shutil.copyfile(backup, copied)
            status, prompts = self.run_interactive(['verify', '--backup', copied, '--public-key', public])
            self.assertEqual((status, prompts), (0, 1))
            status, _ = self.run_interactive(['verify', '--backup', copied, '--public-key', public], 'wrong-fixture-passphrase')
            self.assertNotEqual(status, 0)
            previous = backup.read_bytes()
            status, _ = self.run_interactive(args)
            self.assertNotEqual(status, 0)
            self.assertEqual(backup.read_bytes(), previous)
            self.assertEqual(private.read_bytes(), original)

    def test_noninteractive_backup_is_rejected_without_reading_passphrases(self):
        result = subprocess.run(['sh', str(SCRIPT), 'verify', '--backup', '/unused', '--public-key', '/unused'], input='', capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('local Terminal', result.stderr)
