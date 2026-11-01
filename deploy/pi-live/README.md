# Live Pi installer

## Experimental player-only updater

The new updater is under development; it is not part of `install.sh` and has no
control-room button yet. See [the delivery and recovery plan](../../docs/REMOTE_PLAYER_UPDATES.md).

`bootstrap-updater.sh` installs the stable supervisor once with root permission.
Its payload must include the three Python tools, a separately trusted
`release-public.pem`, and a signed `initial-release/` directory. Only the public
verification key goes on the Pi. The signing private key remains with the
release operator and must be backed up securely outside Git.

Bootstrap saves the existing software and configuration in a root-only local
backup, stages and verifies the initial release as the kiosk user, and installs
a service override. The player HTML uses a stable link through the active release
so image paths remain relative to the existing content directory. No OS package
upgrade, Wi-Fi change or device re-enrolment is performed.

Restore the former kiosk if needed:

```bash
sudo /var/backups/opencourt-before-updater/restore.sh
```

This restores software only and preserves live configuration and credentials.
The bootstrap deliberately refuses to overwrite an existing bootstrap backup.
Physical browser acceptance, service integration and interruption testing are
required before using this experimental path on club displays.

### Controlled offline-start check (test appliance only)

`test-offline-start.sh` temporarily applies `PrivateNetwork=yes` to the kiosk
service only. The host's Wi-Fi, SSH and saved credentials remain unchanged.
An enabled recovery timer removes the test override and restarts the kiosk with
normal networking after about three minutes. The timer starts again on boot, so
power cycling during the test does not lose automatic recovery.

Run with sudo only on the designated test appliance, then inspect the cached
slideshow and, when directed, power-cycle it to check offline kiosk startup.
Verify the kiosk has its own network namespace, fresh local health and the
expected cached content. Afterwards verify the override and temporary timer
have been removed, normal cloud access has returned, and no credentials or
content changed. This is kiosk network isolation; it does not test OS boot with
the Wi-Fi access point absent.

Manual early recovery:

```bash
sudo sh /var/lib/opencourt-offline-recovery/restore.sh
```

The script refuses to overwrite an already configured offline test. It never
changes the normal player release or enrolment. Use the normal software backup
and rollback procedure for those.

This directory is the Phase 1 installer for an already-flashed Raspberry Pi. It is intentionally separate from the reproducible image definition in `image/`.

The installer:

- updates Raspberry Pi OS;
- installs Chromium, Cage, seatd and a fallback web font;
- copies operator-supplied JPEG/PNG images, when provided;
- installs a small revisioned JSON configuration supporting `image`, `image_slideshow` and `google_slides` sources;
- runs a standard-library supervisor that opens Slides as the top-level page and keeps the last valid source when a candidate configuration is invalid;
- starts the kiosk as the unprivileged `opencourt` user; and
- supervises it with `systemd` on TTY1.

No Heatherdale image is required by the installer. Before transfer, edit `device-config.json` and `remote.json` for the intended device. The checked-in example still references `honours-board.jpg`; replace that source for a new installation. Supply locally referenced JPEG/PNG files in the payload directory (or its `assets/` directory), or use HTTPS image URLs. The installer preserves existing device configuration on subsequent runs. Local filenames should contain only letters, numbers, dots, underscores and hyphens, and start with a letter or number.

A fresh device requires an initially playable configuration. An HTTPS source needs working internet for its first download; after successful staging it works offline. A local source and its files provide an immediate offline fallback. Remote bootstrap settings alone do not supply local fallback artwork.

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

## Local image slideshow

Use this source in the device configuration:

```json
{
  "type": "image_slideshow",
  "durationSeconds": 15,
  "slides": [
    {"type": "image", "url": "drinks.png"},
    {"type": "image", "url": "food.png"}
  ]
}
```

Slides retain their order. One image stays on screen; multiple images loop with simple cuts. Each image supports the same optional expected dimensions, SHA-256 and alt text as a single image. All images in a remote revision, including future scheduled sources, must download and validate before the player replaces its persisted configuration. Failed updates leave the previous revision playable after offline reboot.

Limits: 1–50 slides, 3–300 seconds per slide, 20 MiB and 16,777,216 pixels per image. Across one complete device configuration, unique images may total at most 100 MiB encoded and 64 million decoded pixels (roughly 256 MB of raw RGBA image data; Chromium uses additional memory). Resize oversized artwork before upload. These limits apply to scheduled images as well. Cached images are rechecked against dimensions and checksums before use. Images with a SHA-256 use a stable URL/checksum cache key and are reused across configuration revisions. Legacy revision-keyed files are validated and migrated locally, supporting an offline player upgrade. Images without a checksum retain revision-specific keys. Older revision cache files are retained for recovery; automatic cache reclamation remains future work.

Provision only the new Bar Prices TV with this player until the existing displays are intentionally upgraded. Older players do not gain slideshow support merely by receiving a new configuration.
