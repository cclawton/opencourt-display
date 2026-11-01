# Remote player updates — implementation plan

Status: experimental implementation and TEST deployment, 1 November 2026.
The local mechanism and cloud polling are installed on the home Pi. A real
update requested through the TEST control room completed successfully, including
signed download, activation, probation and cloud acknowledgement. Production is
unchanged.

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

## Real kiosk acceptance on Bar Prices TV

On 1 November the operator ran the one-time privileged bootstrap. The stable
tools and public verification key are root-owned under `/opt/opencourt-updater`.
The kiosk service override launches the unprivileged supervisor inside Cage.
The HTML path remains `/var/lib/opencourt/player.html`, linked through
`software/current` so existing relative image references work. The player now
reports its exact release ID through the existing diagnostics field.

- Initial release `player-2026.11.01-updater1` bootstrapped successfully and
  reported fresh local health. The operator confirmed the menu looked correct.
- A second signed release, `player-2026.11.01-updater2`, was requested through
  the local request file and accepted after probation with the real Chromium
  kiosk running.
- Signed `test-failure-2026.11.01` deliberately exited with status 42. The
  supervisor automatically restored updater2, recorded the failed release, and
  the restored player reported fresh health.
- SHA-256 checks of both device configuration and remote settings were identical
  before and after the tests. Credentials were not printed or transferred.
- All changes were on the home TEST Pi. The existing club displays and cloud
  infrastructure were unchanged.

The signing private key is retained only in an ignored, restrictive local export
directory on the operator's Mac. A secure independent backup and the production
release-signing/key-recovery procedure still need to be established. Temporary
test keys from the earlier staging proof were not used for the installed trust
key. The local backup restore command is documented in the Pi installer README.

The previous kiosk took the systemd 90-second stop timeout during bootstrap.
Normal player-to-player activation succeeded without that service restart.
Service stop/reboot behaviour still needs acceptance testing.

## Cloud transport and TEST control room

Implemented and deployed to TEST on 1 November:

- Administrators can choose one published release for one display from its
  information panel. Convenors cannot request software updates. Older players
  receive a useful explanation of the one-time installation requirement.
- Signed release files use the existing website bucket and CloudFront. The
  reviewed catalogue is bundled with the API; arbitrary administrator-supplied
  software URLs are not accepted. Signing keys and device credentials are never
  release assets.
- A device authenticates software polling/reporting with its own existing
  credential. Commands expire after 24 hours. Conditional command writes and
  audit records are independent of content revisions. Content updates preserve
  concurrent health/software fields instead of replacing the whole device item.
- The supervisor polls over outbound HTTPS; fixed filenames, bounded responses
  and no redirects prevent archive extraction and credential forwarding. A
  signature is checked before staging or activation. Existing release files must
  be byte-identical to the verified download before reuse.
- New CLI-built signed manifests constrain Debian major version and Chromium
  major version as well as architecture. The current TEST release is deliberately
  restricted to Debian 13 and Chromium 155. Schema-1 local test releases remain
  readable for migration; they have no OS/browser compatibility constraints.
- Durable handled-request history prevents older commands from activating again.
  A deliberate 4096-request limit fails closed and requires operator maintenance.

Verification: 45 Python tests, 42 infrastructure/API tests, 13 private backend
tests, and 32 desktop/mobile browser tests passed. Public/private TypeScript and
frontend builds passed. The private CDK synthesis and template diff changed only
Lambda code. The deployed change set also contained the expected dynamic URL and
invocation-permission references to that same function, with no data-resource
changes. The TEST stack reached UPDATE_COMPLETE. Existing account, billing,
authentication, runtime settings and private club composition were preserved.

The actual Pi successfully authenticated to the deployed software endpoint and
downloaded/verified `player-2026.11.01-updater3` from TEST CloudFront into an
isolated directory, including its signature and OS/browser checks. The signed-in
TEST browser shows the new information panel. The operator then completed the supervisor refresh. A signed-in administrator
requested updater3 through the real TEST control-room button. The Pi downloaded
and accepted that release, reported completion, and the server stopped delivering
the completed command. The live interface showed “Software update complete.”
Fresh local health and unchanged device/remote configuration checksums were
verified after completion. Menu configuration remained revision 29.

The transport code lives in the stable supervisor rather than the replaceable
player, so the first local-only prototype needs an operator-assisted refresh.
`refresh-updater.sh` was run successfully by the operator on the home Pi. It retains the trusted public key,
backs up the stable tools, bounds the service stop timeout, and requests a signed
bridge release. It requires the operator's sudo password. This is TEST
development; the final club bootstrap will include transport from the start.

Still required before production: explicit rollback of an accepted release,
browser rendering
readiness, a documented secure signing-key backup/recovery procedure, and physical
interruption/recovery testing. The updater is not ready for production rollout.

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
