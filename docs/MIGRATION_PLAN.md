# Heatherdale display migration plan

Date: 27 September 2026

## Outcome

Build the new Raspberry Pi as the first appliance running the shared display software. Its normal role will be the 4K honours board. During coexistence it can be switched to the new court-allocation player for testing. The existing court-allocation Pi and its SD card stay unchanged until the new system has run reliably at the club.

After acceptance, flash a separate card for the existing Pi and run the same software on both devices with different device profiles:

| Device profile | Normal content | Optional override/test content |
| --- | --- | --- |
| `honours-board-tv` | Native 3840×2160 honours board | Court-allocation programmes |
| `court-allocation-tv` | Scheduled Google Slides court allocations | One-off event or honours board |

The new TV normally shows only the honours board. Court allocations on that TV are an administrator-selected **test or override** during coexistence, not an automatic rotation. An authorised committee member can select the court display for a test and then use **Return to schedule** to restore the honours board.

## Important finding: Google Slides is not a native 4K path

The source asset in `../heatherdale-honours-board/tv-output/heatherdale-honours-board-3840x2160.png` is 3840×2160. Inspection of the live Google Slides presentation on 27 September 2026 found:

- The slide player requests an asset URL ending in `=s2048`.
- The live slide markup describes the raster as 2048×1152.
- The source filename remains `heatherdale-honours-board-3840x2160.png`, so the filename can misleadingly suggest that the displayed asset is still 4K.
- Google documents a maximum 1600-pixel width for the Slides API's `LARGE` page thumbnail. This is separate from the slideshow player, but it confirms that the Slides rendering APIs are designed around derived display images rather than delivery of original 4K pixels.

Conclusion: retain Google Slides for court allocations, where text and tables remain readable, but do not use a Google Slides player as the production source for the 4K honours board.

The honours board can still remain within the club's Google Workspace operational model:

1. Keep the editable board data and committee access under club-owned accounts.
2. Store a 3840×2160 JPEG in Google Drive if the club wants Drive to be the file of record.
3. Have the Pi download the original binary rather than display it through Slides, then verify the downloaded dimensions and checksum before replacing the cached copy.
4. Prefer the existing honours-board web app for routine editing because it already renders a 3840×2160 canvas from small structured records. Its display-only view can later replace the JPEG transfer without changing the Pi runtime.

For the first installation, use the known 4K JPEG as a local cached asset. That provides the cleanest 4K test and removes Google, cloud hosting and Wi-Fi from the initial HDMI-quality test.

## Shared device design

Keep the device software small. Each Pi needs only:

- A local kiosk launcher supervised by `systemd`.
- Chromium running under a minimal display session.
- A local configuration file containing a device ID and the public control endpoint. It must contain no Wi-Fi or Google passwords.
- A player page that understands two source types:
  - `image`: an original JPEG/PNG, checked for expected dimensions and cached atomically.
  - `google_slides`: a published or Viewer presentation URL, deliberately reloaded when its programme revision changes.
- A last-known-good cache, so a failed network request never blanks the TV.
- A health record containing current mode, content revision, last successful update, screen mode and software version.

The player should select content from downloaded configuration and local time. The cloud service should not stream video, proxy Google Slides, keep an open connection or run a minute-by-minute scheduler. Each device polls a small configuration document every 60 seconds using `ETag`/`If-None-Match`. An unchanged response is tiny. A committee member's **Refresh now** action increments a revision; the next poll reloads the selected source.

## Committee control

The committee control room should provide:

- Sign-in restricted to approved club-owned Google Workspace accounts.
- A list of TVs and their current status.
- Weekly court-allocation programmes and their Google Slides sources.
- Date-specific one-off events and overrides.
- A default source for each device.
- **Preview**, **Show now**, **Return to schedule** and **Refresh now** actions.
- An audit trail showing who changed what and when.

Display devices need anonymous read-only access only to their own non-secret configuration. Administrative write endpoints require authentication. Do not embed a reusable Google password, committee credential or broad Drive token on a Pi.

## Cost-minimised cloud architecture

### Selected production control plane: AWS serverless

The club prefers AWS or Vercel over Cloudflare because both have broad tooling, documentation and AI-assisted development support. **AWS is the production default** because it allows this very small workload to remain usage-priced, whereas Vercel's free Hobby plan is restricted to personal, non-commercial use and its current Pro entry price is USD $20/month.

Keep the AWS footprint deliberately small:

- Host the static player and control-room application with S3 and CloudFront, deployed from GitHub Actions. AWS Amplify Hosting may be evaluated only if it materially reduces maintenance without creating a significant standing cost.
- Use one small Lambda API, preferably behind a Lambda Function URL initially. Add API Gateway only if its routing, authorisation or throttling features become necessary.
- Store device configuration, schedules, overrides and audit records in DynamoDB on-demand.
- Store the original 4K honours image in S3 and serve it unchanged through CloudFront if the existing honours-board application is not the source endpoint.
- Use Google Workspace sign-in for committee administrators. The API verifies the Google ID token and an explicit club-domain/address allow-list. Do not store Google passwords.
- Keep the device configuration response anonymous, read-only and free of secrets; use an unguessable per-device identifier and signed administrative writes.
- Define the infrastructure with AWS CDK in TypeScript so it is reproducible and can be reviewed alongside the application.
- Configure AWS Budgets and billing alerts before the public endpoint is enabled, initially at low thresholds such as USD $1, $5 and $10.
- Do not deploy EC2, ECS, an always-on container, RDS, a NAT Gateway or a load balancer.
- Treat promotional/free-tier credits as temporary. The design must remain cheap after credits expire.

Two displays polling once per minute produce at most 86,400 reads in a 30-day month, plus negligible committee traffic. Lambda's current perpetual free tier includes one million requests and 400,000 GB-seconds per month, so the compute portion should remain free at this scale. DynamoDB, S3 and CloudFront usage should be very small; the target is **less than a few Australian dollars per month**, excluding any domain registration, but this is a budget target rather than a price guarantee.

Vercel remains a valid future alternative if its terms or the club's willingness to fund Pro change. Do not maintain simultaneous AWS and Vercel production implementations.

The current laptop prototype uses `vinext`, Wrangler and a Cloudflare-specific Vite adapter. It remains usable for the local demonstration, but it is not the production deployment foundation. Before Phase 3, migrate the browser application to a standard static React build (or a static Next.js export), remove the Cloudflare-specific dependencies and add the small AWS CDK stack. Keep that hosting migration separate from the Raspberry Pi player work so it cannot delay the first 4K kiosk test.

## Migration phases

### Phase 0: preserve the existing service

- Leave the existing Pi, SD card, cron entries, scripts and Google Slides links untouched.
- Keep the private audit snapshot outside Git.
- Photograph the working cabling and TV input before any club installation work.
- Do not reuse the existing Pi's default password or personal accounts.

### Phase 1: new Pi bring-up at home

1. Flash a fresh card using Raspberry Pi Imager.
2. Set hostname `opencourt-honours`, timezone `Australia/Melbourne`, Wi-Fi country `AU`, home Wi-Fi and an `opencourt` user.
3. Enable SSH with a public key from the development Mac. Do not use the old `pi/raspberry` credentials.
4. Boot the Pi, identify it at `opencourt-honours.local` or from the router, and connect this coding session by SSH.
5. Record model, RAM, OS, kernel, firmware, network interface and available display modes.
6. Confirm the Bravia negotiates 3840×2160. On a Pi 4/400, use HDMI0 and enable the documented 4K60 option only if the TV and cable support it and the negotiated mode requires it.
7. Show a local copy of the known 3840×2160 JPEG with no browser scaling artefacts.

#### Phase 1 execution log — 27 September 2026

- Installed Raspberry Pi Imager 2.0.11.1 on the development Mac.
- Created the dedicated Ed25519 SSH key `~/.ssh/opencourt_pi` with fingerprint `SHA256:MwsNCz2Dh197klL2oi0atXIGB8DTehTRPP0/INdWqmQ`.
- Wrote and successfully verified Raspberry Pi OS Lite (64-bit), Debian Trixie release dated 15 September 2026, for Raspberry Pi 4.
- Applied hostname `opencourt-honours`, user `opencourt`, Australian localisation, `Australia/Melbourne` timezone, Australian keyboard and home Wi-Fi. No credential values are recorded in this repository.
- Raspberry Pi Imager's SSH switch did not persist on this macOS/Imager combination, and its public-key screen did not discover the dedicated key. After the verified write, created the standard empty `/boot/firmware/ssh` first-boot marker through the macOS `bootfs` volume instead.
- Safely ejected the completed card and completed first boot successfully.
- Verified the Raspberry Pi 4 Model B Rev 1.5, 3.7 GiB usable RAM, Raspberry Pi OS Lite 64-bit / Debian 13 (Trixie), `aarch64`, kernel `6.18.50+rpt-rpi-v8`, a 29 GiB root filesystem and the `Australia/Melbourne` timezone.
- Installed `opencourt_pi.pub` for the `opencourt` account, verified key login, then disabled SSH password and keyboard-interactive authentication and root login. Password-only SSH now fails while the dedicated key continues to work.
- Added the idempotent live installer in `deploy/pi-live/`. It installs Chromium, Cage and the minimal seat components, runs the display as the unprivileged `opencourt` user and supervises it with `systemd`.
- Installed the original 3840×2160 honours-board JPEG. Its installed SHA-256 checksum, `1698c6cea97a80f5c487ce53f1299354441f778cf601b03dd2d64dfb57a2f66d`, matches the source project.
- Verified `opencourt-kiosk.service` is enabled and active, Cage and Chromium are running, the service has zero restarts and its journal contains no kiosk errors. Chromium is displaying the local cached asset and therefore does not depend on Wi-Fi or Google Slides for normal operation.
- Verified HDMI0 is connected. The home test display exposes modes only up to 1920×1080, so native 3840×2160 output remains an explicit acceptance test for the honours-board Bravia at the club.
- Recorded a healthy post-install state: `get_throttled=0x0` and 51.1 °C during initial Chromium operation.
- Completed a controlled reboot. The Pi booted at 13:25:37 AEST and `opencourt-kiosk.service` became active five seconds later without manual intervention. The post-boot service remained at zero restarts with no kiosk journal errors; HDMI0 was connected, temperature was 49.6 °C and `get_throttled=0x0`.

### Phase 2: shared player MVP

- Add device profiles and the `image` and `google_slides` providers.
- Bundle/cache the 4K honours-board JPEG.
- Load the existing published court Slides into a private device configuration, not source code.
- Add a local keyboard recovery command and a remote read-only health endpoint.
- Add atomic last-known-good updates and a visible offline/stale indicator available to administrators but hidden in normal kiosk mode.
- Verify clean boot, browser crash recovery, network loss, content refresh and power loss.

#### Phase 2 execution log — 27 September 2026

- Added a revisioned device configuration with explicit `image` and `google_slides` source types.
- The first browser-only poll stopped after an unchanged revision; a regression test reproduced that failure and confirmed the corrected recurring poll.
- Google returned a 403 when the published Saturday Morning presentation was placed inside an iframe, even though the same URL was public and returned HTTP 200. Off-screen Pi renders confirmed the presentation worked when Google Slides was the browser's top-level page and failed only when framed.
- Replaced iframe switching with a small standard-library Python supervisor. It validates JSON configuration, keeps the current browser when a candidate configuration is invalid, and restarts Chromium only for a changed revision, changed source or browser failure. It opens images through the local dimension-checking player and Google Slides directly at top level.
- Installed the supervisor on `opencourt-honours`. Revision 2 switched from the honours image to the legacy Saturday Morning presentation, which displayed “Winter Grand Final 2026” without error. Revision 3 then returned the TV to the local honours board without a service restart or manual browser action.
- Added an optional, separately bootstrapped remote configuration URL. The Pi always launches its local last-known-good document first, then uses HTTPS conditional requests, a 128 KiB response limit, device-ID/schema/source validation and atomic replacement. Remote polling is disabled until the authenticated AWS control endpoint is ready.

### Phase 3: committee control plane

- Deploy the static control room to S3/CloudFront and the small Lambda/DynamoDB configuration API using AWS CDK.
- Connect club-owned Google Workspace authentication for approved committee members.
- Import the recurring programme definitions and one-off event model.
- Register only the new Pi.
- Test preview, show-now, return-to-schedule and refresh operations.
- Apply request limits, audit logging, backups, AWS Budgets and low-value billing alerts.

#### Phase 3 implementation status — 27 September 2026

- Added and synthesized the isolated AWS CDK package in `infra/` for Sydney (`ap-southeast-2`). It defines a pay-per-request DynamoDB table, a 128 MB ARM Lambda with reserved concurrency of two, a GET-only Function URL, seven-day logs and mandatory actual-cost alerts at USD $1, $5 and $10.
- Added public configuration projection, ETag/304 handling, malformed-path handling and contract tests. The Lambda role has only `dynamodb:GetItem`; no public write route is present.
- Added a guarded local seed command that validates image/Google Slides providers and allows only a strictly newer revision to replace an existing device item.
- Parameterised the club, stage and operational owner; added account-migration tags and deletion protection; and documented a one-display-at-a-time move to a future club-owned AWS account in `infra/MIGRATION.md`.
- The AWS account is authenticated but not yet CDK-bootstrapped. No cloud resources have been created. Deployment awaits confirmation of the billing-alert email address; Google-authenticated committee writes and static control-room hosting remain subsequent increments.

### Phase 4: coexistence at the club

- Install the new Pi behind the honours-board Bravia.
- Keep the existing court TV and Pi operating independently.
- Run the honours board as the new Pi's default.
- Use planned test windows to switch the new Pi to court allocations and compare its programme selection and refresh timing with the existing TV.
- Observe for at least two full competition cycles, including Saturday morning, Saturday afternoon, mid-week ladies and a night competition.
- Record boot recovery, Wi-Fi recovery, image sharpness, committee update latency and any TV input/power behaviour.

### Phase 5: migrate the existing court Pi

- Do not overwrite its existing card.
- Flash a second new card with the accepted image.
- Register that Pi as `court-allocation-tv`.
- Compare both cards during a controlled maintenance window.
- Keep the original card labelled and recoverable until the committee accepts the migration.

## Acceptance gates

Do not progress to the next phase until the current gate passes.

### Home gate

- SSH key access works after reboot.
- Chromium starts without manual interaction.
- TV output is confirmed as 3840×2160.
- The honours board remains sharp when viewed at normal distance and close range.
- The court programme can be selected and refreshed.
- Removing the network leaves the last-known-good screen visible.

### Club coexistence gate

- The new Pi survives scheduled TV power cycles even though its own power remains on.
- Committee members can update content without calling a former maintainer.
- Scheduled court selection agrees with the old Pi throughout the observation period.
- Manual refresh completes within the agreed target, initially 60–120 seconds.
- No club or member secrets appear in public configuration or logs.

### Existing Pi migration gate

- The same release runs on both devices.
- Device profiles alone determine the normal screen.
- The old SD card can restore service immediately.
- At least two committee members have completed the update and recovery instructions.

## Today's actions

### Confirmed hardware

The new display appliance is:

- **Raspberry Pi 4 Model B, 4 GB** (Core Electronics CE06425).
- **Official Raspberry Pi 4 USB-C power supply, 5.1 V / 3 A / 15.3 W** (CE06427).
- **Official Raspberry Pi 4 red/white case** (CE06432).
- **1 m micro-HDMI-to-standard-HDMI cable** (CE06431).
- **Large Raspberry Pi 4 heatsink, 40 × 30 × 5 mm** (CE09095).
- **Lexar Blue Plus 32 GB A1 microSD card**, observed on the development Mac on 27 September 2026 as a 31.3 GB removable USB device with one FAT32 partition.

This is ample for a single 4K kiosk display. Use the Pi's HDMI0 connector (the micro-HDMI socket closest to the USB-C power connector) for the 4K60 test. The supplied power unit is the correct official rating.

The heatsink is described as low-profile and suitable for most Pi cases, but the supplier does not explicitly guarantee this heatsink/case combination. Before removing its adhesive backing, dry-fit the heatsink and case lid and check that the lid closes without touching or pressing on it. Start with the official case and monitor temperature/throttling; change to a ventilated or fan case only if measurements show it is necessary.

The cable is suitable for connecting the Pi 4 to a standard HDMI display, but its product description does not explicitly certify 4K60. Test the negotiated display mode before buying a replacement; a 4K30 result can also be caused by the selected TV input or its HDMI enhanced-format setting.

### Buy

- Nothing else is required for the first boot. The purchased 32 GB A1 card has sufficient capacity and performance for this kiosk workload.
- A second reputable card is still recommended later as a spare/recovery card and as the non-destructive migration card for the existing Pi.

No other hardware is required for first boot. A keyboard, mouse and Ethernet cable are optional fallbacks because Raspberry Pi Imager can preconfigure Wi-Fi and SSH.

Avoid very cheap or marketplace-seller cards. Capacity is not the main concern; authenticity, random I/O and write endurance are.

### Prepare on the Mac while the card is being purchased

- Install or update Raspberry Pi Imager from Raspberry Pi's official site.
- Locate the Mac's SSH public key, or create a dedicated `opencourt` key pair if none exists. Never send the private key or Wi-Fi password in chat or commit it.
- Keep the confirmed Pi 4 kit together and leave the heatsink adhesive backing in place until its case clearance has been dry-tested.
- Keep the known 4K JPEG at its existing path in `heatherdale-honours-board/tv-output/`.
- Do not copy the legacy Pi scripts into the public implementation.
- Establish source control before implementation changes. This directory is not currently a Git checkout. Create or clone the intended public repository, verify `.private-pi-audit/` and local secrets remain excluded, run a secret scan, then make the clean-room baseline commit.

### Flash after returning with the card

For today's development bring-up, use the current **Raspberry Pi OS Lite (64-bit)** rather than waiting for the custom appliance image. The custom image becomes the reproducible deliverable after the runtime works.

In Raspberry Pi Imager:

1. Choose the exact Raspberry Pi model.
2. Choose Raspberry Pi OS Lite (64-bit).
3. Select the new microSD card and verify the target carefully. On 27 September 2026 it appeared as `/dev/disk4`, 31.3 GB, with a `NO NAME` FAT32 volume, but device identifiers can change after reconnection: re-run the read-only disk check immediately before writing and identify it by capacity and removable status rather than assuming `disk4` is unchanged.
4. Set hostname `opencourt-honours`.
5. Create user `opencourt` with a new unique password.
6. Enter the home Wi-Fi locally and set wireless country `AU`.
7. Set locale/timezone to Australia/Melbourne.
8. Enable SSH using the Mac's public key.
9. Write the card and allow Imager to complete its verification pass.

### Connect this coding session

1. Insert the card, connect HDMI0 to the test display, then power on the Pi.
2. Wait two to five minutes for first boot.
3. From the Mac, test `ping opencourt-honours.local`.
4. If mDNS does not resolve, find the address in the home router's connected-device list or run `hostname -I` on a locally attached keyboard/display.
5. Provide only the hostname or local IP address in this task. The coding session can then connect over SSH and continue the baseline audit and installation. Do not send the password if key authentication was configured.

### Work that can begin before the Pi is reachable

- Refactor the player model around device profiles and source providers.
- Add the 4K image provider and last-known-good cache.
- Add schedule/configuration schemas and migration fixtures based on the private audit.
- Add a local development profile for the honours-board TV.
- Keep cloud deployment disabled until authentication and public/private data boundaries have tests.

## Decisions still required

1. Decide whether the honours-board source of record should become the existing editable honours-board app or a 4K JPEG maintained in Google Drive.

## Research references

- [Raspberry Pi getting started and Imager customisation](https://www.raspberrypi.com/documentation/computers/getting-started.html)
- [Raspberry Pi display capabilities](https://www.raspberrypi.com/documentation/computers/configuration.html)
- [Official Raspberry Pi A2 microSD specifications](https://www.raspberrypi.com/products/sd-cards/)
- [Google Slides page-thumbnail limits](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [AWS S3 pricing and current free-tier model](https://aws.amazon.com/s3/pricing/)
