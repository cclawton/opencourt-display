#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run this installer as root (for example: sudo ./install.sh).' >&2
  exit 1
fi

payload_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_user=${OPENCOURT_USER:-opencourt}

if ! id "$target_user" >/dev/null 2>&1; then
  printf 'User %s does not exist.\n' "$target_user" >&2
  exit 1
fi

for required_file in player.html device-config.json remote.json opencourt-player opencourt-launch-local opencourt-kiosk.service; do
  if [ ! -f "$payload_dir/$required_file" ]; then
    printf 'Missing installer payload: %s\n' "$required_file" >&2
    exit 1
  fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y --no-install-recommends \
  cage \
  chromium \
  fonts-liberation \
  python3-minimal \
  seatd

install -d -o "$target_user" -g "$target_user" -m 0755 /var/lib/opencourt
install -d -o "$target_user" -g "$target_user" -m 0755 /var/lib/opencourt/assets
install -d -o "$target_user" -g "$target_user" -m 0755 /var/cache/opencourt/chromium
install -d -o "$target_user" -g "$target_user" -m 0755 /var/cache/opencourt/chromium-profile
install -o "$target_user" -g "$target_user" -m 0644 "$payload_dir/player.html" /var/lib/opencourt/player.html
# Content is supplied by the operator; no club-specific image is required.
for image in "$payload_dir"/*.jpg "$payload_dir"/*.jpeg "$payload_dir"/*.png; do
  [ -f "$image" ] || continue
  install -o "$target_user" -g "$target_user" -m 0644 "$image" "/var/lib/opencourt/$(basename "$image")"
done
if [ -d "$payload_dir/assets" ]; then
  for image in "$payload_dir"/assets/*.jpg "$payload_dir"/assets/*.jpeg "$payload_dir"/assets/*.png; do
    [ -f "$image" ] || continue
    install -o "$target_user" -g "$target_user" -m 0644 "$image" "/var/lib/opencourt/assets/$(basename "$image")"
  done
fi
if [ ! -f /var/lib/opencourt/device-config.json ]; then
  install -o "$target_user" -g "$target_user" -m 0644 "$payload_dir/device-config.json" /var/lib/opencourt/device-config.json
fi
if [ ! -f /var/lib/opencourt/remote.json ]; then
  install -o "$target_user" -g "$target_user" -m 0600 "$payload_dir/remote.json" /var/lib/opencourt/remote.json
fi
chown "$target_user:$target_user" /var/lib/opencourt/remote.json
chmod 0600 /var/lib/opencourt/remote.json
install -m 0755 "$payload_dir/opencourt-player" /usr/local/bin/opencourt-player
install -m 0755 "$payload_dir/opencourt-launch-local" /usr/local/bin/opencourt-launch-local
install -m 0644 "$payload_dir/opencourt-kiosk.service" /etc/systemd/system/opencourt-kiosk.service

usermod -a -G video,render,input "$target_user"

systemctl daemon-reload
systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
systemctl enable opencourt-kiosk.service
systemctl restart opencourt-kiosk.service

printf '%s\n' 'OpenCourt kiosk installation complete.'
systemctl --no-pager --full status opencourt-kiosk.service || true
