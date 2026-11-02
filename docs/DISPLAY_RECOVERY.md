# Replacing or rebuilding a display appliance

A software backup is not a complete appliance setup. Follow the current supported
OS/browser requirements, preserve the display's intended content and schedule, and
verify the actual TV before declaring a replacement ready.

## Mandatory cursor requirement

**Every new Pi, replacement Pi and freshly flashed SD card requires the transparent
system cursor fix for the Cage/Chromium kiosk.** The Bar Prices replacement setup
initially omitted the same fix already used by the earlier appliances.

- Include `opencourt-transparent-cursor` and `install-transparent-cursor` from
  `deploy/pi-live/` in the provisioning payload.
- Apply the fix using the [cursor install and restore commands](../deploy/pi-live/README.md#required-transparent-system-cursor-on-every-new-or-replacement-display).
- Preserve it during ordinary player updates. Do not infer that a fresh device
  inherits the old device's system settings.
- Reboot, then visually confirm no pointer over the actual single image/local
  slideshow, including slide changes. Also check Google Slides if used.
- A CSS cursor rule, Chromium flag, successful service start or checksum is not
  visual acceptance. OS/theme package maintenance can replace cursor files;
  repeat the check after that maintenance.

## Replacement acceptance checklist

1. Confirm supported hardware, architecture, OS and Chromium before installing.
2. Install the player, updater/trust key, and the mandatory transparent cursor fix.
3. Configure club Wi-Fi and authorised SSH access without putting credentials in Git.
4. Enrol the intended display and restore its content/schedule. For a stolen device,
   replace its device credential rather than reusing it. Public display content
   remains public; credential rotation is not a remote wipe.
5. Check actual resolution, aspect ratio, readable content, schedule and production
   connection. Verify absence of the pointer during playback and transitions.
6. Reboot and confirm playback, Wi-Fi/SSH and cloud reconnection. Verify cached
   playback/offline startup through the established controlled procedure.
7. Retain a verified backup/restore path and record the accepted software version,
   operator and visual checks. The appliance is not ready until these checks pass.
