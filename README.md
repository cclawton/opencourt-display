# OpenCourt Display

OpenCourt Display is an open-source digital signage platform for sports clubs. Use one control room for honours boards, court or facility allocations, event and sponsor notices, and food/drink prices. Raspberry Pi players show the selected content full-screen on club TVs.

Volunteers can keep using familiar tools such as Google Slides or upload finished images. A club can also add its own editors without putting that club’s specialist code or private records into the public project.

The project began at Heatherdale Tennis Club in Melbourne, Australia, but club names, court counts, schedules and content sources are intentionally configurable.

## What is included today

- A working committee demonstration with TV, control-room and first-boot views.
- Eight example Heatherdale display programmes, including a Saturday afternoon allocation shared by Pennant and Seniors.
- Google Slides URL configuration with a native slideshow preview.
- Automatic two-minute refresh and a manual **Refresh TV now** control.
- An authenticated content library with simple slideshow and still-image controls.
- Original-file checksum and dimension verification plus last-known-good image caching on each Pi.
- A progressive web app shell for recovery after a brief network outage.
- A reproducible Raspberry Pi 4/400 image definition based on Raspberry Pi's `rpi-image-gen` web-kiosk pattern.

The local demonstration retains browser-only preview settings. When deployed with a real Google OAuth client and committee allow-list, its control room uses the AWS API for authenticated display changes and image uploads; Google credentials are never stored on a Pi.

The deployed control room uses the Heatherdale Tennis Club logo in its banner and a Calibri-first type stack. The logo is a versioned public application asset, so it is restored with the site build rather than the private AWS data backup.

## Run on a laptop

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. Use **TV display** for the local demonstration, **Control room** to preview it, and **First boot** to walk through device setup. In the deployed committee control room, **Displays** chooses or refreshes content for a TV, while **Content** manages public Google Slides presentations and still images. After editing a Google Slides presentation, select **Refresh TV** so the active display reloads the latest published content.

Committee administrators can use Displays, Content, Schedule and Users. Competition convenors sign in with an SMS or email one-time code and can use Displays and Schedule, but cannot manage the content library or user accounts. OpenCourt browser sessions last 90 days unless they are signed out or revoked.

## Build the web application

```bash
npm run build
```

## Raspberry Pi image

The image source is in [`image/`](image/README.md). It targets the Raspberry Pi 400 and Raspberry Pi 4, boots directly into a Chromium kiosk, and runs a first-boot console setup for:

1. Clubhouse Wi-Fi.
2. The single `opencourt` administrator password.
3. The first Google Slides sharing or published URL.

No club password or Google credential is committed to the image or repository. The image build is designed to run on a supported ARM64 Debian/Raspberry Pi OS host or through the manual GitHub Actions workflow.

## AWS control plane

The cost-minimal AWS control plane is in [`infra/`](infra/README.md). It defines pay-per-request DynamoDB tables, a small ARM Lambda Function URL with ETag support, Google ID-token-protected committee actions, a retained audit trail, a private S3/CloudFront control room and image store, a guarded seed command and mandatory low-dollar billing alerts. Resource names and ownership tags are parameterised, with a [club-account migration runbook](infra/MIGRATION.md) for later transfer out of the pilot account.

The [local AWS backup and restore runbook](docs/BACKUP_RESTORE.md) exports the application data, uploaded display images and convenor directory with checksums. It supports recovery into a clean stack, controlled merge recovery and an explicit exact-rollback mode without committing private backup data.

Agent-assisted AWS work uses the official [Agent Toolkit for AWS](docs/AWS_AGENT_TOOLKIT.md), with repository guardrails for Sydney-region deployment, CDK, least privilege, cost control and future club ownership.

Administrative writes are disabled until the pilot stack is deployed with the club's real Google web client ID and committee email allow-list. Placeholder values deliberately reject every administrator.

## Club use cases

| Club need | Example content | Typical workflow |
| --- | --- | --- |
| Honours and history | Champions, office bearers, club milestones | Prepare an image in an external tool or optional club editor; display it as a still image. |
| Court and facility allocations | Courts, pitches, rinks, competition sessions | Select a Google Slides presentation or image and schedule it for the relevant session. |
| Events and marketing | Social events, open days, sponsor artwork | Upload posters; show one image or rotate several on a supported slideshow player. |
| Food/drink prices | Bar menus, café prices, specials | Prepare readable menu images; show one page or a local image slideshow. |
| Coaching and junior programmes | Coaching times, holiday clinics | Reuse posters and timetables through the same library and schedules. |
| Club information | Opening hours, rules, volunteering, wayfinding | Display a stable information image or presentation. |
| Fixtures, results and notices | Match notices, results, committee announcements | Upload approved artwork or use Google Slides; review it when details change. |

These uses share **Displays**, **Content** and **Schedule**. A TV’s name describes its location or purpose; it does not require a different player application. OpenCourt displays information; bookings, payments, stock control and membership management remain in their own systems. Automated feeds, content expiry, mixed-media playlists and a general page designer are not promised features.

See [Club signage workflows](docs/CLUB_USE_CASES.md) for volunteer-facing examples and the current delivery status.

## Shared platform and optional club extensions

The public platform owns the content library, display selection, scheduling, permissions and playback. A club may maintain specialist editors in a separate repository and include them in its own build. Other clubs can use OpenCourt without installing those editors.

The extension model being tested keeps authoring and publishing explicit:

1. Edit in the club’s optional editor and save the editable source there.
2. Download image(s).
3. Upload the image(s) in generic **Content**, as a single image or an image slideshow on a supported player.
4. Select the content for a display, or assign it through Schedule.

Saving a club editor does not change a TV. The generic player receives display images, not private editor records. For example, one club can privately maintain honours-board and food/drink prices editors while contributing player and slideshow improvements to OpenCourt for everyone.

**Development status:** Google Slides and single images are in the published core. Local image slideshows and the optional extension hooks have been implemented and tested in the development checkout and an isolated club test deployment; their core implementation has not yet been committed or published here. Existing players need the supporting software before receiving an image slideshow. The documentation describes that developing model, not a released plugin SDK.

See [Club extension model](docs/CLUB_EXTENSIONS.md) for repository ownership, frontend/backend composition, privacy boundaries and release compatibility.

See also [Architecture](docs/ARCHITECTURE.md), [MVP scope](docs/MVP.md) and [Backlog](BACKLOG.md). Older planning documents describe the original court-allocation scope and should be read alongside the broader use cases above.

## Security and clean-room development

This is a new implementation based on independently gathered club requirements and publicly documented platform behaviour. Do not contribute source, configuration or documentation copied from a previous proprietary implementation.

Report security issues using [SECURITY.md](SECURITY.md). Never commit Wi-Fi passwords, Google service-account keys, account passwords or presentation content containing private member information.

## Licence

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
