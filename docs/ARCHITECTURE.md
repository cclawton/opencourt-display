# Architecture

## Design principles

1. Google Slides is an authoring source, not the scheduling authority.
2. Programmes represent complete court allocations and may span several competitions.
3. A display must retain its last-known-good content during a network or Google outage.
4. Routine updates must not require remote control of the Raspberry Pi.
5. Club-specific schedules and branding are configuration, not application code.
6. Content providers are replaceable so future clubs can use another authoring system.
7. One appliance image supports multiple display roles; device configuration, not a separate codebase, decides what each TV normally shows.
8. Full-resolution image content bypasses Google Slides rendering when Slides would reduce the source resolution.

## Components

```text
Convenors -> Google Slides -> content provider -> last-known-good cache
                                             |
Weekly programmes + one-off events -> scheduler -> player -> HDMI TV
                                             |
                                      local control room
```

The shared player supports at least two providers:

- `google_slides` for court allocations maintained by convenors.
- `image` for an original-resolution JPEG or PNG such as the 3840×2160 honours board.

Each physical Pi has a stable device ID and a profile. The honours-board Pi normally selects the image provider; the court-allocation Pi normally selects scheduled Slides. An authorised override may temporarily select another source without changing the appliance software.

The device downloads a small revisioned configuration document and evaluates schedules locally. It uses conditional requests and retains the last-known-good configuration and content. The control service does not need an always-on connection to either TV.

### Public demonstration

The web application is a browser-based working prototype. It demonstrates the player, recurring programmes, mixed competition allocations, manual refresh, Google Slides URL handling and first-boot journey. Configuration remains local to the browser so the public committee URL cannot become an unauthenticated production control plane.

### Production cloud control plane

AWS serverless is the selected production platform. The browser application will be deployed as static assets through S3 and CloudFront. A small Lambda API and DynamoDB table will hold device configuration, schedules, overrides and audit records. Google Workspace identity will protect administrative writes; a display receives only its read-only, non-secret configuration. Infrastructure is defined with AWS CDK in TypeScript, with no always-on servers, database instances, NAT Gateway or load balancer.

The existing `vinext`/Wrangler build is a local prototype dependency and will be replaced before production deployment. The Raspberry Pi player and its provider interfaces remain hosting-neutral.

### Raspberry Pi appliance

The image uses Raspberry Pi OS Trixie components, Cage as the minimal Wayland kiosk and Chromium as the player. A first-boot service collects Wi-Fi, administrator and initial Slides settings locally. The kiosk is supervised by `systemd` and restarts after failure or reboot.

The image currently uses the native Google Slides player. A production cached-content provider is the next implementation milestone; its interface should support PDF export or slide thumbnails with atomic last-known-good replacement.

For 4K honours-board content, the image provider must retrieve or bundle the original 3840×2160 file and verify its pixel dimensions before atomic replacement. The Google Slides player is not used for that source because the observed live player supplied a 2048×1152 derivative.

## Scheduling model

A programme contains:

- Stable identifier and display name.
- Local timezone.
- Weekly or date-specific time window.
- Content source reference.
- Optional activity labels.
- Priority and collision behaviour.

One-off events may either replace the regular programme or join its playlist. Higher priority wins when two replacement programmes overlap.

## Trust boundaries

- The public demonstration accepts no secrets.
- Club secrets belong on the device and must be readable only by the appliance service.
- Private Google presentations should use a club-owned read-only service account once the cached provider is implemented.
- Remote administration must use club-owned accounts and keys.
- The former or current maintainer's personal accounts must never be required for operation.
