# Local image slideshow proposal

Status: proposed; implementation and deployment are not authorised by this plan.

## Outcome and scope

Let committee administrators create an ordered image slideshow in OpenCourt and assign it to a display. The Pi downloads it once and loops locally, including after an offline reboot. Internet access is needed to receive changes, not to play an already downloaded slideshow.

Initial use: replace the Android box's bar-menu slideshow, preferably using the spare Pi 3 B+ after a hardware trial. This is image playback, not a drinks editor: changing prices still requires editing and uploading slide artwork.

V1: JPEG/PNG slides, explicit order, one duration for the playlist (default 10 seconds), loop, fit without cropping, black background, preview, explicit save and display selection. Proposed limits: 20 slides, 1080p recommended for the bar, bounded total download size and decoded image dimensions. Use simple cuts. Exclude video, PowerPoint/PDF import, transitions, USB authoring and structured menu editing.

## Existing foundations and gaps

- `deploy/pi-live/opencourt-player` downloads individual images, validates size, dimensions and SHA-256, and serves them through a local file player.
- `deploy/pi-live/player.html` currently displays exactly one image.
- The control API and content library support images and Google Slides; their source schemas need an additive playlist provider.
- Existing source validation protects the running display during failures. However, remote configuration is persisted before its target assets are prepared. Playlist work must explicitly preserve a fully playable active configuration across an offline reboot; atomic JSON writes alone do not guarantee that.
- The reproducible image selects the Pi 4 layer. Pi 3 B+ provisioning and browser behaviour require a separate trial; do not claim existing image compatibility.

## Delivery sequence

1. Hardware and player spike: boot the Pi 3 B+ from a spare SD card, verify power, Wi-Fi and HDMI, and loop representative 1080p slides. Test memory use with only current/next slides decoded. Decide whether to proceed on that hardware.
2. Local engine: define a versioned playlist manifest with immutable asset references, order and duration. Reuse image validation, stage every asset, then atomically activate a complete manifest. Keep the previous playable revision until successful activation. Persist active state independently of a pending update; restart offline from the active revision. Retain assets referenced by active, rollback and staged revisions; bound cache growth.
3. Control service: add playlist content validation and display projection using existing assets/storage and permissions. Reject empty or incomplete playlists. Preserve old content/source formats and guard against assigning playlists to players without support. No new always-on service is expected.
4. Control room: create an image slideshow from uploaded/existing assets, order/remove slides, choose duration and preview. Save a new revision explicitly. Existing displays receive changes through normal polling. Clearly distinguish image slideshows from Google Slides. Keep current admin/convenor permissions.
5. Verify and pilot: run relevant API, supervisor and browser tests, compilation and build checks. Exercise interrupted downloads, corrupt/missing images, insufficient storage, browser restart, offline cold boot, replacement and rollback. Pilot only on the bar TV, with an overnight run and repeated cold boots. Retain the Android box as physical fallback. Document operations before broader use.

## Effort estimate

Engineering estimate from repository inspection, not a fixed delivery commitment. One experienced developer; person-days include implementation and focused verification, exclude waiting for hardware access and producing revised artwork.

| Work | Person-days |
| --- | ---: |
| Pi 3 B+ hardware/player spike | 0.5–1 |
| Local playlist engine and durable update recovery | 1–2 |
| API, schema and compatibility integration | 1–1.5 |
| Control-room creation, ordering and preview | 1–2 |
| Regression checks, operations docs and pilot setup | 1–1.5 |
| **Total** | **4.5–8** |

Allow roughly 1–2 working weeks plus an overnight soak and club access. A manually configured local-only proof of concept could take 0.5–1 day, but would not solve committee self-service updates. Pi hardware faults, OS/graphics incompatibility or extensive UI revisions can extend the estimate. New infrastructure is not expected, but any actual AWS changes must follow repository skill, identity, validation and deployment approval rules.

## User impact

- Committee administrators gain an image-slideshow content option; they still edit prices in the source artwork. Uploading a replacement and saving is the ongoing workflow.
- Convenors can select authorised ready content through existing display controls; no new content-editing permission is proposed.
- Patrons see rotating slides without Google controls; an outage continues the last complete downloaded version. Prices can consequently remain stale until connectivity returns.
- Existing image and Google Slides users keep their workflows. Roll out the player before enabling playlist assignment. No existing display should be forcibly converted or interrupted.
- Operators perform a one-time player update on participating devices. A short restart may be needed; future playlist updates must retain the current slideshow until the replacement is complete. Update latency includes normal polling and downloads.
- Cloud traffic occurs during changes and existing configuration polling; playback is local. Storage and download volume grow with uploaded images. No precise cost estimate has been made.

## Acceptance criteria

An administrator can create, preview, save and select a two-slide bar menu without editing device files. Correct order and timing work at 1080p on the chosen Pi. With Wi-Fi disconnected, looping and a cold reboot work. A failed/incomplete update followed by reboot still plays the previous complete slideshow. A subsequent valid update replaces it as a complete set. Existing static images, Google Slides, schedules and overrides pass regression checks. Rollback to the previous content and the Android box is documented.
