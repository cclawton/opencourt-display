from importlib.machinery import SourceFileLoader
import importlib.util
import json
import platform
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).parents[1] / "deploy/pi-live"
sys.path.insert(0, str(SOURCE))
from player_activation import Activation
from player_release import build, openssl, stage

LOADER = SourceFileLoader("update_watchdog", str(SOURCE / "opencourt-update-supervisor"))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
WATCHDOG = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(WATCHDOG)

FIXTURE = '''import json, os, time
from pathlib import Path
while True:
    Path(os.environ["OPENCOURT_HEALTH_FILE"]).write_text(json.dumps({
        "pid": os.getpid(), "token": os.environ["OPENCOURT_HEALTH_TOKEN"],
        "monotonic": time.monotonic()}))
    time.sleep(.02)
'''


class UpdateWatchdogTests(unittest.TestCase):
    def test_health_requires_matching_process_token_and_fresh_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "health"
            path.write_text(json.dumps({"pid": 1, "token": "fresh", "monotonic": 100}))
            self.assertTrue(WATCHDOG.healthy(path, "fresh", 1, 101))
            self.assertFalse(WATCHDOG.healthy(path, "stale", 1, 101))
            self.assertFalse(WATCHDOG.healthy(path, "fresh", 2, 101))
            self.assertFalse(WATCHDOG.healthy(path, "fresh", 1, 200))
            # A persisted heartbeat from a previous boot can be in the future.
            self.assertFalse(WATCHDOG.healthy(path, "fresh", 1, 99))

    def exercise(self, candidate, expected):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            private, public = directory / "private", directory / "public"
            openssl("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", private)
            openssl("pkey", "-in", private, "-pubout", "-out", public)
            root = directory / "supervisor"
            manager = Activation(root)
            for name, code in (("baseline", FIXTURE), ("candidate", candidate)):
                source = directory / (name + "-source")
                source.mkdir()
                (source / "opencourt-player").write_text(code)
                (source / "player.html").write_text("fixture")
                bundle = directory / (name + "-bundle")
                build(source, bundle, name, private, platform.machine())
                stage(bundle, manager.releases, public)
            manager.initialise("baseline")
            (root / "request.json").write_text(json.dumps({"release": "candidate", "request": "one"}))
            errors = []
            def supervise():
                try:
                    WATCHDOG.run(root, public)
                except BaseException as error:
                    errors.append(error)
            with patch.object(WATCHDOG, "STOP", False), patch.object(WATCHDOG, "PROBATION_SECONDS", .15), patch.object(WATCHDOG, "STARTUP_TIMEOUT", 3), patch.object(WATCHDOG, "TICK_SECONDS", .02):
                thread = threading.Thread(target=supervise)
                thread.start()
                try:
                    deadline = time.monotonic() + 8
                    while time.monotonic() < deadline:
                        state = manager.state()
                        if state["lastRequest"] == "one" and state["phase"] == "accepted":
                            break
                        if errors:
                            raise errors[0]
                        time.sleep(.02)
                    self.assertEqual(manager.state()["active"], expected)
                    self.assertEqual(manager.state()["lastRequest"], "one")
                finally:
                    WATCHDOG.STOP = True
                    thread.join(timeout=5)
                self.assertFalse(thread.is_alive())
                self.assertFalse(errors)

    def test_real_child_process_is_accepted_after_health_probation(self):
        self.exercise(FIXTURE, "candidate")

    def test_crashing_child_is_rolled_back(self):
        self.exercise("raise SystemExit(1)", "baseline")

    def test_live_child_without_health_is_rolled_back(self):
        self.exercise("import time\ntime.sleep(30)", "baseline")
