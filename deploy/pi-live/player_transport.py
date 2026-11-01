"""Bounded outbound HTTPS transport for signed, player-only releases."""
import json
import os
import re
from pathlib import Path
import tempfile
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from player_release import FILES, MAX_FILE, MAX_MANIFEST, stage


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a device credential, or follow release URLs off-origin.
        return None


def fetch(url, limit, token=None, body=None):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Software endpoints must use HTTPS')
    headers = {'User-Agent': 'OpenCourt-Player-Updater/1'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = Request(url, headers=headers,
                      data=json.dumps(body).encode() if body is not None else None)
    with build_opener(NoRedirect()).open(request, timeout=10) as response:
        payload = response.read(limit + 1)
    if len(payload) > limit:
        raise ValueError('Software response exceeds size limit')
    return payload


def endpoint(settings):
    status = settings.get('statusUrl', '')
    parsed = urlparse(status)
    if parsed.query or parsed.fragment or not parsed.path.endswith('/status'):
        raise ValueError('No usable device status endpoint')
    return status[:-len('status')] + 'software'


def report(settings, request, status, active=None):
    fetch(endpoint(settings), 4096, settings['statusToken'],
          {'request': request, 'status': status, 'activeRelease': active})


def download(command, root, public_key):
    release = command.get('release')
    base = command.get('bundleUrl', '')
    parsed = urlparse(base)
    if parsed.query or parsed.fragment or not base.endswith('/'):
        raise ValueError('Invalid release URL')
    # Fixed filenames only. Never unpack an archive or use server-supplied paths.
    with tempfile.TemporaryDirectory(prefix='.download-', dir=root) as temporary:
        bundle = Path(temporary) / 'bundle'
        bundle.mkdir()
        for name, limit in [('manifest.json', MAX_MANIFEST), ('manifest.sig', 1024),
                            *[(name, MAX_FILE) for name in FILES]]:
            (bundle / name).write_bytes(fetch(base + name, limit))
        manifest = json.loads((bundle / 'manifest.json').read_text())
        if manifest.get('release') != release:
            raise ValueError('Downloaded release does not match request')
        # stage verifies the signature and complete payload before making it available.
        with tempfile.TemporaryDirectory(prefix='.verified-', dir=root) as verified:
            result = stage(bundle, Path(verified), public_key)
            target = root / 'releases' / result.name
            if target.exists():
                # Do not trust an existing staging directory without checking its bytes.
                for name in [*FILES, 'manifest.json', 'manifest.sig']:
                    if (target / name).is_symlink() or (target / name).read_bytes() != (result / name).read_bytes():
                        raise ValueError('Existing immutable release differs')
            else:
                os.rename(result, target)
                from player_release import sync_directory
                sync_directory(target.parent)
    return release


def poll(settings, root, public_key, state):
    response = json.loads(fetch(endpoint(settings), 16384, settings['statusToken']))
    if not isinstance(response, dict):
        raise ValueError('Invalid software command response')
    pending = response.get('request')
    if not pending:
        return
    if not isinstance(pending, dict) or set(pending) != {'request', 'release', 'bundleUrl'}:
        raise ValueError('Invalid software command')
    request = pending.get('request')
    if not isinstance(request, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', request):
        raise ValueError('Invalid software command identifier')
    if request == state.get('lastRequest') or request in state.get('handledRequests', []):
        report(settings, request, 'failed' if pending.get('release') == state.get('failed') else 'complete', state['active'])
        return
    report(settings, request, 'downloading', state['active'])
    try:
        download(pending, root, public_key)
        report(settings, request, 'checking', state['active'])
    except Exception:
        report(settings, request, 'failed', state['active'])
        raise
    temporary = root / 'request.cloud.tmp'
    temporary.write_text(json.dumps({'request': request, 'release': pending['release']}))
    os.replace(temporary, root / 'request.json')
