#!/bin/sh
# Operator-assisted refresh of the stable supervisor during TEST development.
# Routine player releases must use the signed update mechanism instead.
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
payload=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tools=/opt/opencourt-updater
root=/var/lib/opencourt/software
test -f "$root/activation.json"
test -f "$tools/release-public.pem"
test -f "$payload/bridge-release/manifest.json"
for name in player_release.py player_activation.py player_transport.py opencourt-update-supervisor; do
    test -f "$payload/$name"
done
# Verify with the already trusted key. The operator's transfer does not replace it.
sudo -u opencourt /usr/bin/python3 "$payload/player_release.py" stage \
    --bundle "$payload/bridge-release" --releases "$root/releases" \
    --public-key "$tools/release-public.pem"
backup=$(mktemp -d /var/backups/opencourt-updater.XXXXXX)
cp -a "$tools" "$backup/tools"
cp -a /etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf "$backup/service.conf"
restore_on_error() {
    echo 'Supervisor refresh failed; restoring the saved tools.' >&2
    cp -a "$backup/tools/." "$tools/"
    cp -a "$backup/service.conf" /etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf
    systemctl daemon-reload
    systemctl restart opencourt-kiosk.service
}
trap restore_on_error EXIT
for name in player_release.py player_activation.py player_transport.py opencourt-update-supervisor; do
    install -m 0644 "$payload/$name" "$tools/$name"
done
# Cage previously needed its full default stop timeout. Bound the restart delay.
if ! sed -n '/^TimeoutStopSec=/p' /etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf | read -r value; then
    printf '\nTimeoutStopSec=25\n' >> /etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf
fi
systemctl daemon-reload
systemctl restart opencourt-kiosk.service
sudo -u opencourt /usr/bin/python3 - "$root" "$payload/bridge-release/manifest.json" <<'PY'
import json, os, sys
from pathlib import Path
root=Path(sys.argv[1])
release=json.load(open(sys.argv[2]))['release']
temporary=root/'request.bootstrap.tmp'
temporary.write_text(json.dumps({'release': release, 'request': 'bridge-20261101'}))
os.replace(temporary, root/'request.json')
PY
trap - EXIT
echo 'Supervisor refreshed. The signed bridge player will now start.'
printf 'Supervisor backup: %s\n' "$backup"
