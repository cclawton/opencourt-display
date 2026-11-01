import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).parents[1] / "deploy/pi-live"
sys.path.insert(0, str(SOURCE))
from player_activation import Activation


class PlayerActivationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.manager = Activation(Path(self.directory.name))
        for name in ("old", "new"):
            directory = self.manager.releases / name
            directory.mkdir()
            for filename in ("opencourt-player", "player.html", "manifest.json", "manifest.sig"):
                (directory / filename).write_text("fixture")
        self.manager.initialise("old")

    def current(self):
        return (self.manager.root / "current").resolve().name

    def test_acceptance_survives_restart(self):
        self.assertTrue(self.manager.begin("new", "request1"))
        self.assertEqual(self.current(), "new")
        self.manager.accept()
        self.assertEqual(self.manager.recover(), "new")
        self.assertFalse(self.manager.begin("new", "request1"))

    def test_restart_during_probation_rolls_back_and_replay_is_ignored(self):
        self.manager.begin("new", "request1")
        self.assertEqual(Activation(self.manager.root).recover(), "old")
        self.assertEqual(self.current(), "old")
        self.assertFalse(self.manager.begin("new", "request1"))
        with self.assertRaisesRegex(ValueError, "Failed release"):
            self.manager.begin("new", "request2")

    def test_power_loss_after_journal_before_switch_restores_baseline(self):
        with patch.object(self.manager, "switch", side_effect=OSError("power lost")):
            with self.assertRaises(OSError):
                self.manager.begin("new", "request1")
        self.assertEqual(self.current(), "old")
        self.assertEqual(self.manager.recover(), "old")

    def test_power_loss_during_rollback_remains_recoverable(self):
        self.manager.begin("new", "request1")
        with patch.object(self.manager, "save", side_effect=OSError("power lost")):
            with self.assertRaises(OSError):
                self.manager.rollback()
        self.assertEqual(self.current(), "old")
        self.assertEqual(self.manager.recover(), "old")

    def test_second_supervisor_cannot_take_lock(self):
        with self.manager.lock():
            with self.assertRaises(BlockingIOError):
                with Activation(self.manager.root).lock():
                    self.fail("Second supervisor acquired lock")

    def test_path_traversal_missing_and_symlink_releases_rejected(self):
        for name in ("../old", "absent", "/tmp/old"):
            with self.assertRaises(ValueError):
                self.manager.begin(name, "request1")
        (self.manager.releases / "link").symlink_to(self.manager.releases / "new")
        with self.assertRaises(ValueError):
            self.manager.begin("link", "request1")
        self.assertEqual(self.current(), "old")
