#!/usr/bin/env python3
"""Package a previously signed player and reviewed bootstrap tools; never sign."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parents[1] / 'deploy/pi-live'
sys.path.insert(0, str(SOURCE))
from player_release import FILES, MAX_FILE, regular_bytes, validate_manifest

TOOLS = ('bootstrap-updater.sh', 'bootstrap_install.py', 'player_release.py',
         'player_activation.py', 'player_transport.py', 'opencourt-update-supervisor')


def build(release, public_key, output):
    if release.is_symlink() or {p.name for p in release.iterdir()} != {*FILES, 'manifest.json', 'manifest.sig'}:
        raise ValueError('Expected exact four-file signed release')
    encoded = regular_bytes(release / 'manifest.json', 16 * 1024)
    manifest = validate_manifest(encoded, 'aarch64')
    subprocess.run(['openssl', 'dgst', '-sha256', '-verify', str(public_key),
                    '-signature', str(release / 'manifest.sig'), str(release / 'manifest.json')],
                   check=True, capture_output=True)
    for name, entry in manifest['files'].items():
        data = regular_bytes(release / name, MAX_FILE)
        if len(data) != entry['size'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('Signed release payload mismatch')
        if data != (SOURCE / name).read_bytes():
            raise ValueError('Accepted release differs from current player source; review before packaging')
    der = subprocess.run(['openssl', 'pkey', '-pubin', '-in', str(public_key), '-outform', 'DER'],
                         check=True, capture_output=True).stdout
    fingerprint = hashlib.sha256(der).hexdigest()
    output.mkdir(parents=True, exist_ok=False)
    for name in TOOLS:
        shutil.copyfile(SOURCE / name, output / name)
    shutil.copyfile(public_key, output / 'release-public.pem')
    shutil.copytree(release, output / 'initial-release')
    instructions = f'''OpenCourt one-time updater bootstrap
Initial accepted release: {manifest['release']}
Trusted public-key SHA-256 (DER): {fingerprint}

Compare the archive checksum with the operator's separately saved value.
Check without changing the running kiosk:
  python3 -B bootstrap_install.py check
Install only after the check passes:
  sudo sh bootstrap-updater.sh
Restore original software if necessary:
  sudo /var/backups/opencourt-before-updater/restore.sh

Keep current content, schedules, Wi-Fi, SSH keys and HDMI settings. No OS upgrade.
Stop on unsupported OS/Chromium/architecture, unexpected service or existing updater.
Check picture, production heartbeat and reboot before proceeding to the next Pi.
'''
    (output / 'READ-ME-FIRST.txt').write_text(instructions)
    sums = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(output.rglob('*')) if p.is_file()}
    (output / 'SHA256SUMS.json').write_text(json.dumps(sums, indent=2) + '\n')
    archive = output.with_suffix('.tar.gz')
    # Deterministic metadata; the signed release bytes remain unchanged.
    with archive.open('xb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w|') as tar:
            for p in [output, *sorted(output.rglob('*'))]:
                info = tar.gettarinfo(str(p), arcname=str(Path(output.name) / p.relative_to(output)))
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ''
                info.mode = 0o755 if p.is_dir() else 0o644
                if p.is_file():
                    with p.open('rb') as stream:
                        tar.addfile(info, stream)
                else:
                    tar.addfile(info)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_name(archive.name + '.sha256').write_text(checksum + '  ' + archive.name + '\n')
    return {'release': manifest['release'], 'archive': str(archive), 'sha256': checksum,
            'publicKeySha256': fingerprint}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', type=Path, required=True)
    parser.add_argument('--public-key', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.release, args.public_key, args.output), indent=2))


if __name__ == '__main__':
    main()
