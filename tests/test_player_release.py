import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).parents[1] / "deploy/pi-live"
SPEC = importlib.util.spec_from_file_location("player_release", SOURCE / "player_release.py")
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)


@unittest.skipUnless(shutil.which("openssl"), "OpenSSL required")
class SignedPlayerReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keys = tempfile.TemporaryDirectory()
        cls.private = Path(cls.keys.name) / "test-only-private.pem"
        cls.public = Path(cls.keys.name) / "test-only-public.pem"
        RELEASE.openssl("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", cls.private)
        RELEASE.openssl("pkey", "-in", cls.private, "-pubout", "-out", cls.public)

    @classmethod
    def tearDownClass(cls):
        cls.keys.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / "bundle"
        self.releases = self.root / "releases"
        RELEASE.build(SOURCE, self.bundle, "test-release", self.private)

    def stage(self):
        return RELEASE.stage(self.bundle, self.releases, self.public, "aarch64")

    def test_verified_release_matches_payload_and_cannot_be_overwritten(self):
        target = self.stage()
        for name in RELEASE.FILES:
            self.assertEqual((target / name).read_bytes(), (SOURCE / name).read_bytes())
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.stage()

    def test_corruption_does_not_change_active_release_or_leave_staging_files(self):
        self.releases.mkdir()
        old = self.releases / "old"
        old.mkdir()
        (self.releases / "current").symlink_to(old)
        (self.bundle / "player.html").write_text("corrupted")
        with self.assertRaisesRegex(ValueError, "integrity"):
            self.stage()
        self.assertEqual((self.releases / "current").resolve(), old.resolve())
        self.assertEqual(sorted(p.name for p in self.releases.iterdir()), ["current", "old"])

    def test_changed_manifest_signature_is_rejected(self):
        path = self.bundle / "manifest.json"
        path.write_bytes(path.read_bytes().replace(b"test-release", b"evil-release"))
        with self.assertRaises(subprocess.CalledProcessError):
            self.stage()
        self.assertFalse(self.releases.exists())

    def test_unsigned_signature_is_rejected(self):
        (self.bundle / "manifest.sig").write_bytes(b"not a signature")
        with self.assertRaises(subprocess.CalledProcessError):
            self.stage()

    def test_architecture_mismatch_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "architecture"):
            RELEASE.stage(self.bundle, self.releases, self.public, "armv7l")

    def test_symlinks_and_extra_files_are_rejected(self):
        path = self.bundle / "player.html"
        path.unlink()
        path.symlink_to(SOURCE / "player.html")
        with self.assertRaisesRegex(ValueError, "regular file"):
            self.stage()
        path.unlink()
        path.write_bytes((SOURCE / "player.html").read_bytes())
        (self.bundle / "remote.json").write_text("must never ship credentials")
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            self.stage()

    def test_low_space_is_rejected(self):
        with patch.object(RELEASE.shutil, "disk_usage", return_value=type("Disk", (), {"free": 0})()):
            with self.assertRaisesRegex(ValueError, "storage"):
                self.stage()

    def test_duplicate_keys_and_path_identifiers_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            RELEASE.validate_manifest(b'{"release":"one","release":"two"}', "aarch64")
        with self.assertRaisesRegex(ValueError, "identifier"):
            RELEASE.build(SOURCE, self.root / "bad", "../escape", self.private)

