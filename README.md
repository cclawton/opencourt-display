# OpenCourt Display

OpenCourt Display is an open-source clubhouse signage system for tennis court allocations. Convenors keep preparing content in Google Slides while a Raspberry Pi selects the correct presentation, refreshes it automatically and shows it full-screen on a TV.

The project began at Heatherdale Tennis Club in Melbourne, Australia, but club names, court counts, schedules and content sources are intentionally configurable.

## What is included today

- A working committee demonstration with TV, control-room and first-boot views.
- Eight example Heatherdale display programmes, including a Saturday afternoon allocation shared by Pennant and Seniors.
- Google Slides URL configuration with a native slideshow preview.
- Automatic two-minute refresh and a manual **Refresh TV now** control.
- A one-off event override demonstration.
- A progressive web app shell for recovery after a brief network outage.
- A reproducible Raspberry Pi 4/400 image definition based on Raspberry Pi's `rpi-image-gen` web-kiosk pattern.

The public demonstration is not yet a production administration service. Its settings are stored only in the current browser and it never uploads passwords or Google credentials.

## Run on a laptop

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. Use **TV display** to show the board, **Control room** to preview programmes and Google Slides, and **First boot** to walk through device setup.

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

The cost-minimal read-only device configuration stack is in [`infra/`](infra/README.md). It defines a pay-per-request DynamoDB table, a small ARM Lambda Function URL with ETag support, a guarded seed command and mandatory low-dollar billing alerts. It is synthesized and tested but is not deployed by the repository's automated checks. Resource names and ownership tags are parameterised, with a [club-account migration runbook](infra/MIGRATION.md) for later transfer out of the pilot account.

Administrative writes remain disabled until Google Workspace ID-token verification and an explicit committee allow-list are implemented.

## Product model

OpenCourt schedules **display programmes**, not competitions. A programme represents the complete court allocation for a time window and may contain multiple simultaneous activities. One-off events can replace or supplement the regular programme.

See [Architecture](docs/ARCHITECTURE.md), [MVP scope](docs/MVP.md) and [Backlog](BACKLOG.md).

The staged Heatherdale rollout, including the new 4K honours-board Pi, coexistence with the legacy court Pi, today's card-flashing checklist and cloud cost guardrails, is documented in the [display migration plan](docs/MIGRATION_PLAN.md).

## Security and clean-room development

This is a new implementation based on independently gathered club requirements and publicly documented platform behaviour. Do not contribute source, configuration or documentation copied from a previous proprietary implementation.

Report security issues using [SECURITY.md](SECURITY.md). Never commit Wi-Fi passwords, Google service-account keys, account passwords or presentation content containing private member information.

## Licence

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
