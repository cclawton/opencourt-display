#!/bin/sh
# TEST appliance only: isolate the kiosk's network, preserving host SSH/Wi-Fi.
# Automatic recovery survives a reboot; no player/content/credential changes.
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
dropin=/etc/systemd/system/opencourt-kiosk.service.d/30-offline-test.conf
recovery=/var/lib/opencourt-offline-recovery
timer=/etc/systemd/system/opencourt-offline-recovery.timer
service=/etc/systemd/system/opencourt-offline-recovery.service
if [ "${1:-}" = '--restore' ]; then
    test -f "$recovery/restore.sh"
    exec sh "$recovery/restore.sh"
fi
test -f /var/lib/opencourt/software/activation.json
test -f /etc/systemd/system/opencourt-kiosk.service.d/20-updater.conf
if [ -e "$dropin" ] || [ -e "$timer" ] || [ -e "$service" ]; then
    echo 'An offline test is already configured. Restore it before retrying.' >&2
    exit 1
fi
install -d -m 0700 "$recovery"
cat > "$recovery/restore.sh" <<'RESTORE'
#!/bin/sh
set -eu
rm -f /etc/systemd/system/opencourt-kiosk.service.d/30-offline-test.conf
systemctl disable --now opencourt-offline-recovery.timer >/dev/null 2>&1 || true
rm -f /etc/systemd/system/opencourt-offline-recovery.timer
rm -f /etc/systemd/system/opencourt-offline-recovery.service
systemctl daemon-reload
systemctl restart opencourt-kiosk.service
echo 'Kiosk internet access restored; host networking was unchanged.'
RESTORE
chmod 0700 "$recovery/restore.sh"
cat > "$service" <<'SERVICE'
[Unit]
Description=Restore OpenCourt kiosk internet after controlled offline test
[Service]
Type=oneshot
ExecStart=/bin/sh /var/lib/opencourt-offline-recovery/restore.sh
SERVICE
cat > "$timer" <<'TIMER'
[Unit]
Description=Automatic recovery for OpenCourt offline-start test
[Timer]
OnActiveSec=180
AccuracySec=1s
Unit=opencourt-offline-recovery.service
[Install]
WantedBy=timers.target
TIMER
# Install the boot-enabled recovery timer before isolating the kiosk.
systemctl daemon-reload
systemctl enable --now opencourt-offline-recovery.timer
trap 'sh "$recovery/restore.sh"' EXIT
printf '[Service]\nPrivateNetwork=yes\n' > "$dropin"
systemctl daemon-reload
systemctl restart opencourt-kiosk.service
trap - EXIT
echo 'Kiosk-only offline test started. SSH and saved Wi-Fi are unchanged.'
echo 'Automatic recovery runs in about 3 minutes, including after a reboot.'
echo 'You may now power-cycle the Pi to test offline startup.'
echo 'Manual restore: sudo sh /var/lib/opencourt-offline-recovery/restore.sh'
