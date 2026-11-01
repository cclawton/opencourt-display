#!/bin/sh
# One-time root installation. No OS/package, network or enrolment changes.
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
payload=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=/var/lib/opencourt/software
tools=/opt/opencourt-updater
backup=/var/backups/opencourt-before-updater
dropin=/etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf
[ ! -e "$root/activation.json" ] || { echo 'Updater already initialised.' >&2; exit 1; }
[ ! -e "$backup" ] || { echo 'Existing bootstrap backup found; inspect before retrying.' >&2; exit 1; }
[ ! -e "$dropin" ] || { echo 'Existing updater service override found.' >&2; exit 1; }
for name in player_release.py player_activation.py player_transport.py opencourt-update-supervisor release-public.pem; do
    [ -f "$payload/$name" ] || { echo "Missing payload: $name" >&2; exit 1; }
done
test -f "$payload/initial-release/manifest.json"
test -f /var/lib/opencourt/player.html
test -f /usr/local/bin/opencourt-player
id opencourt >/dev/null
install -d -m 0700 "$backup"
# Secrets remain in a root-only local backup, never in the release bundle.
tar -C / -cpf "$backup/before.tar" var/lib/opencourt/player.html \
    var/lib/opencourt/device-config.json var/lib/opencourt/remote.json \
    usr/local/bin/opencourt-player usr/local/bin/opencourt-launch-local \
    etc/systemd/system/opencourt-kiosk.service
cat > "$backup/restore.sh" <<'RESTORE'
#!/bin/sh
set -eu
[ "$(id -u)" -eq 0 ] || exit 1
systemctl stop opencourt-kiosk.service
rm -f /etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf
rm -f /var/lib/opencourt/player.html
# Restore software only. Live content, enrolment and credentials are preserved.
tar -C / -xpf /var/backups/opencourt-before-updater/before.tar \
    var/lib/opencourt/player.html usr/local/bin/opencourt-player \
    usr/local/bin/opencourt-launch-local etc/systemd/system/opencourt-kiosk.service
systemctl daemon-reload
systemctl restart opencourt-kiosk.service
echo 'Previous kiosk restored; configuration and credentials preserved.'
RESTORE
chmod 0700 "$backup/restore.sh"
restore_on_error() {
    echo 'Bootstrap failed; restoring previous kiosk.' >&2
    "$backup/restore.sh"
}
trap restore_on_error EXIT
install -d -m 0755 "$tools"
for name in player_release.py player_activation.py player_transport.py opencourt-update-supervisor release-public.pem; do
    install -m 0644 "$payload/$name" "$tools/$name"
done
install -d -o opencourt -g opencourt -m 0755 "$root" "$root/releases"
sudo -u opencourt /usr/bin/python3 "$tools/player_release.py" stage \
    --bundle "$payload/initial-release" --releases "$root/releases" \
    --public-key "$tools/release-public.pem"
sudo -u opencourt /usr/bin/python3 - "$root" "$tools" "$payload/initial-release/manifest.json" <<'PY'
import json, sys
sys.path.insert(0, sys.argv[2])
from player_activation import Activation
manager = Activation(sys.argv[1])
with manager.lock():
    manager.initialise(json.load(open(sys.argv[3]))['release'])
PY
systemctl stop opencourt-kiosk.service
ln -s "$root/current/player.html" /var/lib/opencourt/.player-updater.html
mv -Tf /var/lib/opencourt/.player-updater.html /var/lib/opencourt/player.html
install -d -m 0755 /etc/systemd/system/opencourt-kiosk.service.d
cat > "$dropin" <<'SERVICE'
[Service]
ExecStart=
ExecStart=/usr/bin/cage -- /usr/bin/python3 /opt/opencourt-updater/opencourt-update-supervisor --root /var/lib/opencourt/software --public-key /opt/opencourt-updater/release-public.pem
SERVICE
systemctl daemon-reload
systemctl restart opencourt-kiosk.service
trap - EXIT
echo 'Updater installed. Verify the picture and local health before acceptance.'
echo 'Restore if needed: sudo /var/backups/opencourt-before-updater/restore.sh'
