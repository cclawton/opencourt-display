# Live Pi installer

This directory is the Phase 1 installer for an already-flashed Raspberry Pi. It is intentionally separate from the reproducible image definition in `image/`.

The installer:

- updates Raspberry Pi OS;
- installs Chromium, Cage, seatd and a fallback web font;
- copies a local, original-resolution 3840×2160 honours-board JPEG;
- installs a small revisioned device configuration supporting `image` and `google_slides` sources;
- starts the kiosk as the unprivileged `opencourt` user; and
- supervises it with `systemd` on TTY1.

`honours-board.jpg` is deployment content and is deliberately excluded from Git. Copy the chosen source image into this directory before transferring the payload to a Pi.

Run on the Pi from the transferred payload directory:

```bash
sudo ./install.sh
```

The installation is idempotent. Re-running it refreshes the packages, files and service definition.

## Device configuration

`device-config.js` is deliberately plain JavaScript so the local player can read it directly without a web server or an internet connection. The installer creates `/var/lib/opencourt/device-config.js` only when it does not already exist, preserving later device-specific changes.

The initial configuration selects the bundled image and verifies it is 3840×2160 before replacing the current screen. To select a slideshow, use a Viewer or published Google Slides URL:

```js
window.OPENCOURT_CONFIG = {
  schemaVersion: 1,
  deviceId: 'honours-board-tv',
  revision: 2,
  pollIntervalSeconds: 60,
  source: {
    type: 'google_slides',
    url: 'https://docs.google.com/presentation/d/PRESENTATION_ID/edit',
    title: 'Court allocations',
  },
};
```

Increase `revision` whenever the selected source should reload. Invalid configuration, an unavailable image or incorrect image dimensions leave the last working content on screen.
