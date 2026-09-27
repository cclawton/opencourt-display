[Unit]
Description=OpenCourt Chromium kiosk
After=opencourt-firstboot.service network-online.target systemd-time-wait-sync.service
Wants=network-online.target
Requires=opencourt-firstboot.service

[Service]
User=$OPENCOURT_USER
TTYPath=/dev/tty1
Environment="XDG_RUNTIME_DIR=/home/$OPENCOURT_USER"
Environment="OPENCOURT_APP_URL=$OPENCOURT_APP_URL"
Restart=always
RestartSec=3
ExecStart=/usr/bin/cage -- /usr/local/bin/opencourt-launch
StandardError=journal

[Install]
WantedBy=default.target
