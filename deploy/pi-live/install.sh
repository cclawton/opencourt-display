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

for required_file in player.html device-config.js opencourt-launch-local opencourt-kiosk.service honours-board.jpg; do
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
  seatd

install -d -o "$target_user" -g "$target_user" -m 0755 /var/lib/opencourt
install -d -o "$target_user" -g "$target_user" -m 0755 /var/cache/opencourt/chromium
install -o "$target_user" -g "$target_user" -m 0644 "$payload_dir/player.html" /var/lib/opencourt/player.html
install -o "$target_user" -g "$target_user" -m 0644 "$payload_dir/honours-board.jpg" /var/lib/opencourt/honours-board.jpg
if [ ! -f /var/lib/opencourt/device-config.js ]; then
  install -o "$target_user" -g "$target_user" -m 0644 "$payload_dir/device-config.js" /var/lib/opencourt/device-config.js
fi
install -m 0755 "$payload_dir/opencourt-launch-local" /usr/local/bin/opencourt-launch-local
install -m 0644 "$payload_dir/opencourt-kiosk.service" /etc/systemd/system/opencourt-kiosk.service

usermod -a -G video,render,input "$target_user"

systemctl daemon-reload
systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
systemctl enable opencourt-kiosk.service
systemctl restart opencourt-kiosk.service

printf '%s\n' 'OpenCourt kiosk installation complete.'
systemctl --no-pager --full status opencourt-kiosk.service || true
