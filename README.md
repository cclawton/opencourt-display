# OpenCourt Display

OpenCourt Display is an open-source clubhouse signage system for tennis court allocations. Convenors keep preparing content in Google Slides while a Raspberry Pi selects the correct presentation, refreshes it automatically and shows it full-screen on a TV.

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

## Product model

OpenCourt stores **display content**, not competitions. A slideshow represents the complete court allocation for a time window and may contain multiple simultaneous activities. The current content types are Google Slides and still images; the content API deliberately keeps the type/provider boundary open for future channels.

See [Architecture](docs/ARCHITECTURE.md), [MVP scope](docs/MVP.md) and [Backlog](BACKLOG.md).

The staged Heatherdale rollout, including the new 4K honours-board Pi, coexistence with the legacy court Pi, today's card-flashing checklist and cloud cost guardrails, is documented in the [display migration plan](docs/MIGRATION_PLAN.md).

## Security and clean-room development

This is a new implementation based on independently gathered club requirements and publicly documented platform behaviour. Do not contribute source, configuration or documentation copied from a previous proprietary implementation.

Report security issues using [SECURITY.md](SECURITY.md). Never commit Wi-Fi passwords, Google service-account keys, account passwords or presentation content containing private member information.

## Licence

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
