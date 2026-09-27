# Raspberry Pi image

This directory is a source tree for Raspberry Pi's official [`rpi-image-gen`](https://github.com/raspberrypi/rpi-image-gen) tool. It follows that project's web-kiosk example and pins compatibility to release `v2.6.0`.

## Target

- Raspberry Pi 400 or Raspberry Pi 4.
- 64-bit Raspberry Pi OS/Debian Trixie base.
- A/B system layout for future resilient updates.
- Cage, Chromium and `systemd` supervision.

## First boot

Connect a keyboard and TV for the first boot. The setup asks for:

1. Wi-Fi network and password.
2. A password of at least 12 characters for the `opencourt` administrator.
3. A Google Slides sharing or published URL.

The Wi-Fi secret is passed directly to the installed wireless manager and is not written to the OpenCourt configuration. Only the non-secret presentation identifier is stored in `/var/lib/opencourt/device.conf`.

The initial image supports native published Google Slides. Private service-account synchronization and offline presentation caching are deliberately not claimed as complete yet.

## Build on a supported host

Use a 64-bit Raspberry Pi running current Raspberry Pi OS or a Debian Trixie ARM64 host.

```bash
git clone --depth 1 --branch v2.6.0 https://github.com/raspberrypi/rpi-image-gen.git
cd rpi-image-gen
sudo ./install_deps.sh
cd /path/to/opencourt-display
RPI_IMAGE_GEN_DIR=/path/to/rpi-image-gen \
OPENCOURT_APP_URL=https://your-public-app.example \
./image/build-image.sh
```

The macOS application can be developed on a MacBook or Mac mini, but the official image builder expects a Linux host with filesystem and mount capabilities unavailable to a normal macOS process. The repository's manual GitHub Actions workflow provides an alternative ARM64 build host.

## Flashing

Use Raspberry Pi Imager's **Use Custom** option to write the generated `.img` file to a new microSD card. Keep the existing club card offline and unchanged during migration.
