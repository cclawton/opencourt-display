#!/usr/bin/env python3
"""One-time updater installation; preserve content, network and enrolment."""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tarfile
import tempfile
import time

from player_release import stage, sync_directory
from player_activation import Activation

TOOLS = ('player_release.py', 'player_activation.py', 'player_transport.py',
         'opencourt-update-supervisor', 'release-public.pem')
SOFTWARE = ('var/lib/opencourt/player.html', 'usr/local/bin/opencourt-player',
            'usr/local/bin/opencourt-launch-local',
            'etc/systemd/system/opencourt-kiosk.service')
SETTINGS = ('var/lib/opencourt/device-config.json', 'var/lib/opencourt/remote.json')
DROPIN = 'etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_bytes(path, data, mode=0o644, owner=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name('.' + path.name + '.bootstrap-tmp')
    with temporary.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(mode)
    if owner:
        os.chown(temporary, *owner)
    os.replace(temporary, path)
    sync_directory(path.parent)


class Installer:
    # A different root/service is injected only by isolated filesystem tests.
    def __init__(self, root=Path('/'), service=None, owner=None, ready=None):
        self.root = Path(root)
        self.base = self.root / 'var/lib/opencourt/software'
        self.tools = self.root / 'opt/opencourt-updater'
        self.backup = self.root / 'var/backups/opencourt-before-updater'
        self.service = service or self.system_service
        self.owner = owner
        self.ready = ready or self.wait_ready

    @staticmethod
    def system_service(action):
        if action == 'reload':
            subprocess.run(['systemctl', 'daemon-reload'], check=True)
        else:
            subprocess.run(['systemctl', action, 'opencourt-kiosk.service'], check=True)

    def wait_ready(self, started):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                state = json.loads((self.base / 'activation.json').read_text())
                health = json.loads((self.base / 'player-health.json').read_text())
                age = time.monotonic() - health['monotonic']
                pid = health['pid']
                if (state['phase'] == 'accepted' and isinstance(pid, int) and pid > 0
                        and health['monotonic'] >= started and 0 <= age <= 15):
                    os.kill(pid, 0)
                    return
            except (OSError, ValueError, KeyError, TypeError):
                pass
            time.sleep(2)
        raise TimeoutError('New player did not report fresh startup health; restoring original software')

    def check_release(self, payload):
        for name in (*TOOLS, 'bootstrap_install.py'):
            path = payload / name
            if path.is_symlink() or not path.is_file():
                raise ValueError('Missing or unsafe installer file: ' + name)
        package = json.loads((payload / 'SHA256SUMS.json').read_text())
        for name, digest in package.items():
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unsafe package checksum path')
            path = payload / relative
            if path.is_symlink() or not path.is_file() or sha(path) != digest:
                raise ValueError('Installer package checksum mismatch: ' + name)
        required = {*TOOLS, 'bootstrap_install.py', 'bootstrap-updater.sh',
                    *('initial-release/' + name for name in
                      ('manifest.json', 'manifest.sig', 'opencourt-player', 'player.html'))}
        if not required.issubset(package):
            raise ValueError('Incomplete installer checksum manifest')
        with tempfile.TemporaryDirectory(prefix='opencourt-bootstrap-verify-') as directory:
            verified = stage(payload / 'initial-release', Path(directory) / 'releases',
                             payload / 'release-public.pem')
            manifest = json.loads((verified / 'manifest.json').read_text())
        return manifest

    def check_content(self, payload):
        loader = SourceFileLoader('bootstrap_candidate', str(payload / 'initial-release/opencourt-player'))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        candidate = importlib.util.module_from_spec(spec)
        loader.exec_module(candidate)
        candidate.CONTENT_DIR = self.root / 'var/lib/opencourt'
        candidate.ASSET_DIR = candidate.CONTENT_DIR / 'assets'
        def offline(*args, **kwargs):
            raise ValueError('An existing image is not cached; stop and inspect before installation')
        candidate.urlopen = offline
        config = candidate.load_config(candidate.CONTENT_DIR / 'device-config.json')
        candidate.prepare_config(config)
        candidate.target_url(config)
        return config

    def preflight(self, payload):
        manifest = self.check_release(payload)
        for name in (*SOFTWARE, *SETTINGS):
            path = self.root / name
            if path.is_symlink() or not path.is_file():
                raise ValueError('Expected original regular file: ' + name)
        if self.base.exists() or self.backup.exists() or (self.root / DROPIN).exists() or self.tools.exists():
            raise ValueError('Updater or backup already exists; stop rather than overwrite it')
        unit = (self.root / SOFTWARE[-1]).read_text()
        if 'User=opencourt' not in unit or 'cage' not in unit:
            raise ValueError('Unexpected kiosk service; inspect it before installation')
        if self.owner is None:
            user = pwd.getpwnam('opencourt')
            self.owner = (user.pw_uid, user.pw_gid)
        self.check_content(payload)
        return manifest

    def snapshot(self, payload):
        self.backup.mkdir(parents=True, mode=0o700)
        self.backup.chmod(0o700)
        with tarfile.open(self.backup / 'before.tar', 'w') as archive:
            for name in (*SOFTWARE, *SETTINGS):
                archive.add(self.root / name, arcname=name, recursive=False)
        (self.backup / 'before.tar').chmod(0o600)
        with (self.backup / 'before.tar').open('rb') as stream:
            os.fsync(stream.fileno())
        hashes = {name: sha(self.root / name) for name in (*SOFTWARE, *SETTINGS)}
        atomic_bytes(self.backup / 'before-sha256.json', json.dumps(hashes).encode(), 0o600)
        for name in (*TOOLS, 'bootstrap_install.py'):
            atomic_bytes(self.backup / name, (payload / name).read_bytes(), 0o600)
        script = '#!/bin/sh\nset -eu\nexec /usr/bin/python3 -B /var/backups/opencourt-before-updater/bootstrap_install.py restore\n'
        atomic_bytes(self.backup / 'restore.sh', script.encode(), 0o700)

    def restore(self):
        hashes = json.loads((self.backup / 'before-sha256.json').read_text())
        # Read and authenticate all original software before stopping a working kiosk.
        originals = {}
        with tarfile.open(self.backup / 'before.tar') as archive:
            for name in SOFTWARE:
                member = archive.getmember(name)
                if not member.isfile():
                    raise ValueError('Unsafe backup member')
                data = archive.extractfile(member).read()
                if hashlib.sha256(data).hexdigest() != hashes[name]:
                    raise ValueError('Backup integrity check failed: ' + name)
                originals[name] = (data, member.mode, member.uid, member.gid)
        self.service('stop')
        (self.root / DROPIN).unlink(missing_ok=True)
        html = self.root / SOFTWARE[0]
        if html.is_symlink():
            html.unlink()
        for name, (data, mode, uid, gid) in originals.items():
            atomic_bytes(self.root / name, data, mode, (uid, gid))
        # Keep recovery artifacts; never restore stale content or credentials.
        for path, name in [(self.base, 'retired-software'), (self.tools, 'retired-tools')]:
            if path.exists():
                destination = self.backup / name
                if destination.exists():
                    raise ValueError('Recovery destination already exists; inspect before retry')
                path.rename(destination)
        self.service('reload')
        self.service('start')

    def install(self, payload):
        manifest = self.preflight(payload)
        settings = {name: sha(self.root / name) for name in SETTINGS}
        self.snapshot(payload)
        try:
            self.tools.mkdir(parents=True, mode=0o755)
            for name in TOOLS:
                atomic_bytes(self.tools / name, (payload / name).read_bytes(), 0o644)
            self.base.mkdir(parents=True, mode=0o755)
            os.chown(self.base, *self.owner)
            releases = self.base / 'releases'
            releases.mkdir(mode=0o755)
            os.chown(releases, *self.owner)
            accepted = stage(payload / 'initial-release', releases, self.tools / 'release-public.pem')
            manager = Activation(self.base)
            with manager.lock():
                manager.initialise(manifest['release'])
            for path in self.base.rglob('*'):
                if not path.is_symlink():
                    os.chown(path, *self.owner)
                    if path.is_dir():
                        sync_directory(path)
                    else:
                        with path.open('rb') as stream:
                            os.fsync(stream.fileno())
            sync_directory(self.base)
            self.service('stop')
            html = self.root / SOFTWARE[0]
            temporary = html.with_name('.player-updater.html')
            temporary.symlink_to('/var/lib/opencourt/software/current/player.html')
            os.replace(temporary, html)
            sync_directory(html.parent)
            dropin = b'''[Service]
ExecStart=
ExecStart=/usr/bin/cage -- /usr/bin/python3 -B /opt/opencourt-updater/opencourt-update-supervisor --root /var/lib/opencourt/software --public-key /opt/opencourt-updater/release-public.pem
TimeoutStopSec=25
'''
            atomic_bytes(self.root / DROPIN, dropin)
            self.service('reload')
            started = time.monotonic()
            self.service('start')
            self.ready(started)
            if any(sha(self.root / name) != value for name, value in settings.items()):
                raise ValueError('Live settings changed during installation; inspect before acceptance')
        except BaseException:
            self.restore()
            raise
        return accepted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'check-release', 'install', 'restore'])
    parser.add_argument('--payload', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    if args.action in ('install', 'restore') and os.geteuid() != 0:
        raise SystemExit('Run with sudo; checks can run without it.')
    installer = Installer()
    if args.action == 'check-release':
        manifest = installer.check_release(args.payload)
        installer.check_content(args.payload)
        print('Release signature, device compatibility and existing content verified:', manifest['release'])
    elif args.action == 'check':
        manifest = installer.preflight(args.payload)
        print('Preflight passed; current kiosk unchanged:', manifest['release'])
    elif args.action == 'install':
        installer.install(args.payload)
        print('Updater installed. Verify picture, schedule and fresh production status before the next Pi.')
        print('Restore: sudo /var/backups/opencourt-before-updater/restore.sh')
    else:
        installer.restore()
        print('Original software restored. Current content and credentials were preserved.')


if __name__ == '__main__':
    main()
