#!/usr/bin/env python3
"""Durable player activation transactions, owned by the stable supervisor.

No service restarts, shell commands or network operations are performed here.
Every caller must hold the exclusive lock for the full supervision lifecycle.
"""
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import uuid

from player_release import sync_directory


class Activation:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.releases = self.root / "releases"
        self.releases.mkdir(exist_ok=True)
        self.state_path = self.root / "activation.json"

    @contextmanager
    def lock(self):
        with (self.root / "supervisor.lock").open("a") as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def release(self, name):
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", name):
            raise ValueError("Invalid release identifier")
        path = self.releases / name
        if path.is_symlink() or not path.is_dir():
            raise ValueError("Release directory is missing or unsafe")
        for filename in ("opencourt-player", "player.html", "manifest.json", "manifest.sig"):
            file = path / filename
            if file.is_symlink() or not file.is_file():
                raise ValueError("Incomplete release")
        return path

    def state(self):
        if not self.state_path.exists():
            return None
        return json.loads(self.state_path.read_text())

    def save(self, state):
        temporary = self.root / (".state-" + uuid.uuid4().hex)
        try:
            with temporary.open("x") as stream:
                json.dump(state, stream, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.state_path)
            sync_directory(self.root)
        finally:
            temporary.unlink(missing_ok=True)

    def switch(self, release):
        self.release(release)
        temporary = self.root / (".current-" + uuid.uuid4().hex)
        try:
            temporary.symlink_to(Path("releases") / release)
            os.replace(temporary, self.root / "current")
            sync_directory(self.root)
        finally:
            temporary.unlink(missing_ok=True)

    def initialise(self, release):
        if self.state_path.exists() or (self.root / "current").exists():
            raise ValueError("Supervisor already initialised")
        self.release(release)
        self.save({"phase": "accepted", "active": release, "previous": None,
                   "request": None, "lastRequest": None, "failed": None})
        self.switch(release)

    def begin(self, release, request):
        self.release(release)
        if not isinstance(request, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", request):
            raise ValueError("Invalid request identifier")
        state = self.state()
        if not state or state["phase"] != "accepted":
            raise ValueError("No accepted baseline; recover pending transaction first")
        if request == state["lastRequest"]:
            return False
        if release == state["active"]:
            return False
        if release == state["failed"]:
            raise ValueError("Failed release requires a new corrected release identifier")
        # Journal BEFORE changing current. Reboot at either step restores baseline.
        self.save({**state, "phase": "probation", "active": release,
                   "previous": state["active"], "request": request})
        self.switch(release)
        return True

    def accept(self):
        state = self.state()
        if not state or state["phase"] != "probation":
            raise ValueError("No candidate awaiting acceptance")
        self.save({**state, "phase": "accepted", "lastRequest": state["request"]})

    def rollback(self):
        state = self.state()
        if not state or state["phase"] != "probation":
            raise ValueError("No pending candidate")
        baseline = state["previous"]
        self.release(baseline)
        # Keep probation journal durable until the baseline symlink is restored.
        self.switch(baseline)
        self.save({**state, "phase": "accepted", "active": baseline,
                   "previous": None, "failed": state["active"],
                   "lastRequest": state["request"]})
        return baseline

    def recover(self):
        state = self.state()
        if not state:
            raise ValueError("No supervisor baseline")
        if state["phase"] == "probation":
            return self.rollback()
        if state["phase"] != "accepted":
            raise ValueError("Unknown activation state")
        # State is authoritative even if power failed before initial symlink write.
        self.switch(state["active"])
        return state["active"]
