# Remote player updates — implementation plan

Status: implementation started, 1 November 2026. Remote updates are not yet
available. No active player or cloud deployment has been changed.

## Completed foundation

`deploy/pi-live/player_release.py` builds a signed, two-file release and stages
it only after signature, architecture, file allowlist, size, digest and free
space checks. It uses the installed OpenSSL CLI with RSA/SHA-256 signatures.
The public verification key is supplied separately from the release. Credentials
and configuration are excluded by the file allowlist. Staging never switches
the active player. Release installation will need exclusive locking in the
supervisor; the staging command is not a concurrent installation service.

All 29 Python player/release tests passed locally. An isolated signed release
was also verified and staged on Bar Prices TV using a disposable test key.
The running kiosk PID, service start time and both active file hashes remained
unchanged. Test artifacts are under `/tmp` on the device; they are not installed
software and do not provide remote-update capability.

The activation transaction and stable supervisor are now implemented as
`player_activation.py` and `opencourt-update-supervisor`. An exclusive lifecycle
lock prevents two supervisors. A durable probation journal precedes the atomic
symlink switch. Restart during probation restores the previous release. The
supervisor reverifies candidate signatures before activation, accepts a candidate
after a 30-second probation with local health, and rolls back a crashed candidate
or one without health after 120 seconds. The player writes a process/token-bound
heartbeat while Chromium is alive and configuration has loaded. This does not
prove browser page rendering or successful image decoding.

Verification: all 39 Python tests passed locally; all 18 release, activation and
watchdog tests passed on the actual Pi in an isolated `/tmp` directory. These
include real fixture child processes, simulated activation/rollback write
interruptions, duplicate last-request delivery, and exclusive locking. The live
kiosk PID, start time and active file hashes remained unchanged. This is not a
physical power-loss test and does not exercise the real Chromium startup path.

Still required: release compatibility constraints beyond architecture, exact
installed release reporting, network transport, trusted-key provisioning,
bootstrap/service and HTML-path integration, explicit rollback of an accepted
release, durable command history beyond the last request, browser rendering
readiness, API/admin UI, and physical interruption/recovery testing. Test signing
keys must not become production trust keys. The supervisor is not yet installed
as a service or ready for production rollout.

## Outcome

A club administrator can update one selected display from the control room.
The device makes outbound HTTPS requests; club routers need no inbound access.
The same immutable player release can run across all supported displays while
each retains its own content, schedule, credentials and network settings.
This belongs in the public core, independently of private club editors.

## First release scope

- Update the Python player and local HTML player as one release.
- Show installed release, available release and update progress/error.
- Explicit administrator action per device; no automatic fleet rollout.
- Retain the previous working release and support explicit rollback.
- Recover locally after failed startup, including when cloud access is lost.
- Leave OS packages, Chromium, Wi-Fi, SSH and device enrolment unchanged.

The current `deploy/pi-live/install.sh` runs package upgrades and restarts the
kiosk. It is a provisioning path, not the remote update mechanism.

## Device design

Install a small, separately managed update supervisor once on each device.
Keep it outside the player release being replaced so player failure cannot
disable recovery. Start with a fixed application user and no remote shell or
arbitrary command execution. Only the initial installation needs elevated
permission to configure the service and directories.

Store immutable releases under a dedicated release directory. Switch an atomic
`current` symlink only after a complete candidate has been downloaded, verified
and checked. Keep mutable configuration and cached content at their existing
paths. Keep the previous release until the new one is accepted.

Use signed release manifests and a pinned verification public key. Include the
release ID, compatible architecture/platform, required Chromium range, file
allowlist, sizes and SHA-256 digests. HTTPS and a checksum alone do not establish
who authorised a release. The signing private key must stay outside repositories
and devices. Select a maintained verification dependency before implementation.

Reject unsupported platforms, insufficient storage, oversized payloads,
unexpected files, path traversal, symlinks in archives and invalid signatures.
Stage on the same filesystem as the active release. Never execute package
installation scripts delivered with an update.

Persist update state atomically before activation. On startup, reconcile an
interrupted activation before launching the player. Repeated command delivery
must be idempotent. Never retry a failed release indefinitely.

## Health and recovery

The candidate must load the existing configuration and cached content, start
Chromium and report a local ready signal within a bounded probation window.
A stable supervisor watches for crashes and a missing readiness signal and
restores the previous release automatically. Cloud acknowledgement is useful
for operators but cannot be a condition for local recovery.

A process being alive does not prove that pixels are correct. Require visual
acceptance on the first upgraded display before proceeding to the next.
An administrator can request rollback if a visually incorrect release passes
automated health checks. Preserve the honours display's 4K behaviour.

## Control room and API

Keep software-update requests separate from content revision numbers. Record a
unique request ID, selected immutable release, requesting administrator and
device progress. Authenticate administrator requests; a device may read and
acknowledge only its own requests using device credentials. Release files may
be public generic code; commands and device credentials must remain private.

Use the existing outbound polling pattern. Show Downloading, Checking,
Restarting, Complete, or Failed — previous version restored. Disable update
actions for devices that lack updater capability and explain that a one-time
installation is required. Do not offer fleet-wide update in the first release.

## Delivery order

1. Build reproducible release packaging, manifest verification and local staging.
2. Add the stable supervisor, atomic activation and durable rollback state.
3. Exercise recovery locally before adding cloud commands.
4. Add API request/status handling and the administrator interface in TEST.
5. Install once on Bar Prices TV at home and run physical acceptance tests.
6. Promote the reviewed backend and new Pi to production; retain rollback copies.
7. At the club, bootstrap Kitchen TV first, verify it, then Bar Room TV.
   Bring all three to the same accepted player release.

The one-visit goal depends on completing and testing this bootstrap release
before installation. Tuesday 3 November is a target, not a reason to omit
recovery testing. Do not promise a second visit is impossible: hardware and
major OS maintenance can still require attendance.

## Required acceptance evidence

- Invalid signature, corrupt download and unsupported release leave the current
  player running.
- Network loss during download preserves the current release and permits retry.
- Power loss during staging, activation and probation recovers on reboot.
- Candidate startup failure restores the previous release without internet.
- Replayed requests do not repeatedly install or restart a display.
- Successful update preserves enrolment, content, schedules and offline playback.
- Single image, local slideshow, Google Slides and 4K honours output still work.
- A second real update and explicit rollback work from the control room.

Before cloud deployment, follow repository AWS rules: toolkit, identity/region,
tests, TypeScript, synthesis, reviewed infrastructure diff, and confirmed target
account and billing email. Preserve the existing club deployment composition.
