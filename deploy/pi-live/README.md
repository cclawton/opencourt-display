# Live Pi installer

This directory is the Phase 1 installer for an already-flashed Raspberry Pi. It is intentionally separate from the reproducible image definition in `image/`.

The installer:

- updates Raspberry Pi OS;
- installs Chromium, Cage, seatd and a fallback web font;
- copies a local, original-resolution 3840×2160 honours-board JPEG;
- installs a small revisioned JSON configuration supporting `image` and `google_slides` sources;
- runs a standard-library supervisor that opens Slides as the top-level page and keeps the last valid source when a candidate configuration is invalid;
- starts the kiosk as the unprivileged `opencourt` user; and
- supervises it with `systemd` on TTY1.

`honours-board.jpg` is deployment content and is deliberately excluded from Git. Copy the chosen source image into this directory before transferring the payload to a Pi.

Run on the Pi from the transferred payload directory:

```bash
sudo ./install.sh
```

The installation is idempotent. Re-running it refreshes the packages, files and service definition.

## Device configuration

`device-config.json` is read locally by the lightweight player supervisor. The installer creates `/var/lib/opencourt/device-config.json` only when it does not already exist, preserving later device-specific changes. No HTTP server or listening network port is required.

The initial configuration selects the bundled image and verifies it is 3840×2160 before replacing the current screen. To select a slideshow, use a Viewer or published Google Slides URL:

```json
{
  "schemaVersion": 1,
  "deviceId": "honours-board-tv",
  "revision": 2,
  "pollIntervalSeconds": 60,
  "source": {
    "type": "google_slides",
    "url": "https://docs.google.com/presentation/d/PRESENTATION_ID/edit",
    "title": "Court allocations"
  }
}
```

Increase `revision` whenever the selected source should reload. Chromium is restarted only for a changed revision, a changed target or a browser failure. Invalid configuration leaves the current browser and its last-known-good content running.

Google returned a 403 when a published presentation was placed inside an iframe under a local player. The supervisor therefore opens Slides directly as Chromium's top-level page, which is also how the legacy kiosk operated. It uses Google's minimal presentation mode (`rm=minimal`) to suppress the navigation controls while preserving automatic advance and looping. Local images continue through `player.html` so their expected pixel dimensions are checked before display.

Remote JPEG/PNG sources from the control-room image library are downloaded over HTTPS into `/var/lib/opencourt/assets`. The player verifies the MIME type, 20 MB size limit, encoded pixel dimensions and SHA-256 checksum before an atomic cache replacement. If download or verification fails, the active Chromium page and last-known-good local image remain unchanged.

## Optional remote configuration

`/var/lib/opencourt/remote.json` is a separate bootstrap file so a failed or incomplete remote document cannot remove the device's control endpoint. Remote polling is disabled by default:

```json
{
  "schemaVersion": 1,
  "deviceId": "honours-board-tv",
  "configUrl": "https://display.example/devices/honours-board-tv/config"
}
```

When configured, the supervisor:

- requests the small JSON document using `If-None-Match` after the local last-known-good screen has launched;
- requires HTTPS, a matching device ID, the supported schema and a valid source;
- limits responses to 128 KiB;
- writes an accepted document atomically to `device-config.json`; and
- leaves the current browser untouched when DNS, Wi-Fi, the cloud endpoint or validation fails.

The device endpoint must be anonymous and read-only and must never contain Wi-Fi, Google or administrator credentials. Administrative writes belong behind the authenticated control service, not on the Pi.
