# OpenCourt as a club signage platform

Status: product and architecture proposal, 18 October 2026. No deployment or implementation decision is implied.

## Recommendation

Position OpenCourt as club-operated digital signage with optional tools for particular club activities. Build one common publishing and playback system; add specialist authoring tools only where they remove substantial volunteer work. Court allocations remain an important supported workflow rather than the universal content model.

This is a generalisation of the existing application, not a rewrite. Retain Google Slides, still images, existing permissions and device configuration during migration. Continue with club-owned deployments before considering a centrally operated multi-club service. An open-source platform reusable by many clubs does not require multi-tenant hosting.

## Use cases

| Use case | Authoring need | Playback and operational needs |
| --- | --- | --- |
| Honours and history | Infrequent structured records; controlled layout and review | Long-lived content, original-resolution 4K where required, reliable offline default |
| Court/field/rink allocations | Frequent changes; Slides initially, optional bookings integration later | Timezone-aware schedules, temporary override, visible freshness, safe treatment of member details |
| Events and marketing | Posters, announcements, sponsors, open days | Ordered rotation, campaign start/end dates, portrait/landscape assets |
| Hospitality | Menu artwork initially; optional structured item/price editor | Local rotation, easy replacement, confirmed publication, opening/service windows |
| Coaching and junior programmes | Posters or timetables | Date-specific schedules, privacy for children, reusable content |
| Club information and wayfinding | Opening hours, facilities, rules, volunteering | Stable readable defaults, reusable templates, orientation support |
| Fixtures and results | Slides/images initially; optional external feeds | Expiry and freshness rules; sensitive participant data handled deliberately |
| Committee notices and sponsorship | Artwork and announcements | Expiry, intended display selection, approval where the club needs it |

These are candidate scenarios, not commitments to implement every integration. Emergency messaging must not be presented as a certified or dependable life-safety system. Transactions, POS, bookings management and membership management stay in their authoritative systems.

## Shared product model

1. **Club configuration:** branding, timezone, locations and enabled optional tools. Avoid assumptions about tennis, court counts or Melbourne in generic UI and domain logic. Existing values can remain migration defaults.
2. **Assets:** immutable uploaded files, checksums, dimensions and size. Separate assets from the content that references them.
3. **Content:** a named item such as a poster, rendered honours board, menu or Google Slides presentation. Record rendering/provider capabilities rather than inferring behaviour from its business category.
4. **Playlist:** ordered references to content and dwell times. One item is a valid playlist. Initially support images only for deterministic local playback; defer embedded Google Slides mixed with images until duration, failure and browser navigation behaviour have a defined contract.
5. **Programme/schedule:** assign a playlist or legacy content reference to a display during a recurring or dated window. A programme must no longer inherently mean a court allocation. Keep court-specific metadata in its optional tool.
6. **Display:** physical device, default content, schedule, current override and capabilities. Labels such as Bar or Foyer describe intended use; they do not select a separate application build.
7. **Publication:** a validated immutable revision distributed to the selected displays. Distinguish draft, published, downloaded and actually active states; an upload is not evidence that a TV has changed.

Suggested eventual precedence: authorised temporary override with expiry, date-specific event, recurring schedule, default. Preserve the existing implemented precedence during initial additive delivery; changing it requires migration and focused tests. Reject ambiguous scheduling conflicts rather than relying on hidden ordering.

## Authoring versus delivery

External authoring remains first-class: clubs can upload finished artwork or retain Google Slides. Optional editors produce content for the same library and publishing pipeline. The honours-board editor currently downloads an image only; any later publish integration needs deliberate review and must retain its private-record boundary. A hospitality editor can eventually manage categories, items, prices and availability without becoming inventory or POS software.

Do not build an unrestricted page designer. Offer a few readable templates only after concrete club workflows justify them. Business categories should help volunteers find content, not create separate storage, schedulers or players.

## Reliability and hardware contract

Use one player codebase with capability and version reporting. Exact OS images may differ by hardware family; shared source does not mean a single SD image is appropriate everywhere. Keep a tested support matrix, distinguishing proven appliances from experimental third-party devices. Trial the Pi 3 B+ at 1080p before promoting support; the H96 remains experimental until validated.

Local image playback needs complete staged downloads, bounded storage and decoded image memory, atomic activation, persisted last playable revision, offline cold boot and rollback. Keep the current complete revision through partial or failed updates. Google Slides currently remains a network-dependent provider; do not promise identical offline capability across providers.

Stale-content behaviour depends on use: a historical board can persist; an expired event poster should fall back; an outdated allocation or price list may mislead. Support explicit expiry and safe fallbacks, and eventually a freshness policy per content type. Never blank a display solely because a routine download failed. Define precedence between expiry and offline operation and test clock accuracy after an offline boot.

## User experience and permissions

Retain common navigation: Displays, Content, Schedule and Users. Add image playlists inside Content. Display detail should answer: what is active, what should be active, when the device last checked in, whether an update is pending/failed, and what happens outside scheduled hours.

Administrators initially keep content editing; convenors retain existing selection and scheduling permissions. Later validate whether clubs need permissions scoped to a location or collection, such as Bar, without introducing one hard-coded role per use case. Preview, explicit publication, revision history and rollback support volunteer confidence. Viewing a device's intended configuration must not be labelled proof of successful on-screen rendering.

Existing displays retain their sources and assignments. Update player software progressively before enabling new source types on each device. Backward-compatible schemas and capability checks allow a mixed-version rollout. The long-term goal is a consistent supported release, not mandatory simultaneous fleet upgrades.

## Open-source portability

- Provide fictional sample content, generic branding defaults, documented configuration and a club onboarding checklist.
- Keep public display projections separate from private editor records and member data. Hide personal and operational secrets from display manifests.
- Document supported providers and their network, resolution and privacy constraints.
- Keep a narrow playback/provider interface and portable content/playlist exports with asset references. Do not create a general plugin framework before a second real integration needs it.
- Preserve club account ownership, infrastructure as code, backup/restore and one-display rollback. Existing AWS deployment guardrails remain applicable; this review makes no cloud changes.
- Reconcile stale MVP/architecture/backlog statements against implemented schedules, permissions and production behaviour before treating those documents as the release specification.

## Delivery roadmap and effort

1. **Foundation decision and inventory (1–2 person-days):** reconcile current behaviour/docs; define source/playlist/publication schemas, capability compatibility and acceptance criteria across the four main uses. Identify existing club-specific coupling and avoid expanding scope into a wholesale rewrite.
2. **Local image playlists (4.5–8 person-days):** deliver the separate local slideshow plan through common Content and Displays. Includes the Pi 3 trial, durable offline playback, control-room editing, integration and bar pilot. Use this as a shared platform feature, not a bar-only mode.
3. **Generalise scheduling and expiry (2–4 person-days):** date-specific events, temporary override expiry, clear conflicts and fallback/freshness behaviour. Estimate requires checking the current schedule implementation before commitment; retain already working behaviour.
4. **Portable onboarding and fleet operations (2–4 person-days):** generic configuration/examples, tested hardware matrix, capability-gated rollout, operator documentation and clearer desired/downloaded/active status. Automated remote software installation is a separate security and recovery project, not included.
5. **Optional specialist editors (estimate after discovery):** integrate honours publishing or develop a hospitality editor based on actual editing pain. External data feeds, video, arbitrary web pages and commercial multi-tenancy remain separate proposals.

The first four stages total approximately 9.5–18 developer days, plus elapsed pilot/soak time and hardware access. These are planning ranges, not a fixed quote. They exclude refreshed menu artwork, broad redesign, automatic OS updates and unknown hardware faults. Publishable increments should ship separately; the bar need not wait for every generalisation.

## Acceptance across the platform

Test a 4K static honours board, scheduled court Slides, an expiring event campaign and an offline hospitality image playlist. Verify coexistence, permissions, update failure, reboot, scheduling conflicts and one-device rollback. A second fictional club with another timezone, branding and facility names must be configurable without code edits. Distinguish acceptance on supported Pi hardware from experimental Android TV boxes.

## Decisions proposed

Adopt the shared model and local image playlists next. Keep external authoring and single-club ownership. Defer a structured menu editor until the bar workflow is understood. Do not rename the project or rewrite the application as part of this work; product wording can broaden while compatibility is preserved.
