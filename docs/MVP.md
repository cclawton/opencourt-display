# MVP scope

## In scope

- Heatherdale's eight regular display programmes.
- Multiple activities sharing a programme and courts.
- One-off event overrides.
- Google Slides as the content source.
- Native slideshow display for the first working installation.
- Automatic refresh within two minutes and an immediate manual refresh.
- Full-screen Raspberry Pi 400 display.
- Guided first boot for Wi-Fi, one administrator and Google Slides configuration.
- Club-controlled remote administration design.
- Reproducible open-source build and handover documentation.

## Acceptance criteria

- A convenor can edit Google Slides without touching the Pi.
- The running presentation deliberately reloads within two minutes.
- An authorised administrator can request an immediate reload.
- The correct display programme is selected from local time in `Australia/Melbourne`.
- Saturday afternoon can present Pennant and Seniors in one combined allocation.
- A one-off event can take priority over the recurring programme.
- The player starts after boot without manual browser interaction.
- A fresh image collects configuration without embedding club secrets.
- Failure to retrieve new content does not discard the last-known-good version once caching is implemented.

## Explicitly deferred

- Replacement authoring systems.
- Casual member booking integration.
- Multiple administrator roles.
- Centrally hosted multi-club management.
- Private Google service-account synchronization and PDF/image caching.
