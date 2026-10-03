# OpenCourt Kitchen Pi build

This procedure creates `opencourt-kitchen` on a fresh SD card for the Raspberry Pi 400. Keep Pete's original SD card unchanged as the rollback.

## Flash the card

In Raspberry Pi Imager 2.0 select:

- Device: Raspberry Pi 4 / 400 (or Raspberry Pi 400 if listed separately)
- OS: Raspberry Pi OS (other) > Raspberry Pi OS Lite (64-bit)
- Storage: the new SD card

Complete the configuration wizard as follows:

- **Hostname:** `opencourt-kitchen`
- **Localisation:** Melbourne, Australia; timezone `Australia/Melbourne`; choose the preferred Australian keyboard layout. This also sets the Wi-Fi regulatory country.
- **User:** username `opencourt`; create and record a strong sudo password.
- **Wi-Fi:** SSID `WLAN_24` and its password; leave hidden-network disabled unless the network is actually hidden. Imager configures one network here; add `Heatherdale TC` after first boot.
- **Remote Access:** enable SSH and select **public-key authentication**. Select `~/.ssh/opencourt_pi.pub`, or paste the output of `cat ~/.ssh/opencourt_pi.pub`. Never select the private file `~/.ssh/opencourt_pi`.
- **Raspberry Pi Connect:** disabled.
- **Interface options:** leave at their defaults.

Review the summary, write and verify the card, then eject it safely.

Do not place either Wi-Fi password in this repository or the installer archive.

## First boot and installation

Boot the Pi at home, then connect from the laptop:

```bash
ssh -i ~/.ssh/opencourt_pi -o IdentitiesOnly=yes opencourt@opencourt-kitchen.local
```

Copy `opencourt-kitchen-installer.tar.gz` from the laptop:

```bash
scp -i ~/.ssh/opencourt_pi -o IdentitiesOnly=yes \
  opencourt-kitchen-installer.tar.gz \
  opencourt@opencourt-kitchen.local:/tmp/
```

Install the kiosk:

```bash
ssh -t -i ~/.ssh/opencourt_pi -o IdentitiesOnly=yes \
  opencourt@opencourt-kitchen.local \
  'set -e
   mkdir -p /tmp/opencourt-kitchen-install
   tar -xzf /tmp/opencourt-kitchen-installer.tar.gz \
     -C /tmp/opencourt-kitchen-install --strip-components=1
   cd /tmp/opencourt-kitchen-install
   sudo ./install.sh
   sudo install -m 0644 opencourt-transparent-cursor /tmp/opencourt-transparent-cursor
   sudo ./install-transparent-cursor'
```

## Add the clubhouse Wi-Fi

Run this from the laptop while the Pi remains connected to `WLAN_24`:

```bash
ssh -t -i ~/.ssh/opencourt_pi -o IdentitiesOnly=yes \
  opencourt@opencourt-kitchen.local
```

On the Pi, enter the clubhouse password without echoing it or saving it in shell history:

```bash
read -r -s -p "Heatherdale TC password: " CLUBHOUSE_PSK
echo
sudo nmcli connection add type wifi ifname wlan0 \
  con-name "Heatherdale TC" ssid "Heatherdale TC"
sudo nmcli connection modify "Heatherdale TC" \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "$CLUBHOUSE_PSK" \
  connection.autoconnect yes \
  connection.autoconnect-priority 20
unset CLUBHOUSE_PSK
```

## Verification

```bash
hostname
systemctl is-enabled opencourt-kiosk.service
systemctl is-active opencourt-kiosk.service
nmcli -f NAME,TYPE,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show
sudo journalctl -u opencourt-kiosk.service --since "10 minutes ago" --no-pager
```

Expected hostname is `opencourt-kitchen`; the kiosk must be enabled and active; both `WLAN_24` and `Heatherdale TC` must have autoconnect enabled.

Perform a complete shutdown and cold boot before accepting the card:

```bash
sudo poweroff
```
