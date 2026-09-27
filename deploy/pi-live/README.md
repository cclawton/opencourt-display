# Live Pi installer

This directory is the Phase 1 installer for an already-flashed Raspberry Pi. It is intentionally separate from the reproducible image definition in `image/`.

The installer:

- updates Raspberry Pi OS;
- installs Chromium, Cage, seatd and a fallback web font;
- copies a local, original-resolution 3840×2160 honours-board JPEG;
- starts the kiosk as the unprivileged `opencourt` user; and
- supervises it with `systemd` on TTY1.

`honours-board.jpg` is deployment content and is deliberately excluded from Git. Copy the chosen source image into this directory before transferring the payload to a Pi.

Run on the Pi from the transferred payload directory:

```bash
sudo ./install.sh
```

The installation is idempotent. Re-running it refreshes the packages, files and service definition.
