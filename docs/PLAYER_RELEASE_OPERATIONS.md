# Player release operations (experimental)

The player updater is implemented in the public core. Club content, enrolment
credentials and private editors are not part of a player release. See
[test results and rollout gates](REMOTE_PLAYER_UPDATES.md) before production use.

## Signing key ownership and recovery

The release operator keeps the private signing key off devices, websites and Git.
Devices receive only its public verification key through the one-time bootstrap.
Losing the private key prevents publishing further trusted releases; the player
can continue running its last accepted release.

Before club installation, create an encrypted private-key backup in a location
outside the repository and copy that encrypted backup to a second device or
independent backup medium. Use OpenSSL's interactive passphrase prompt; do not
put the passphrase in a command, script, environment variable or chat. For example,
after replacing these example paths with the operator's actual paths:

```sh
umask 077
openssl pkey -in /secure/release-private.pem -aes-256-cbc \
  -out /separate-backup/release-private.encrypted.pem
```

Test the copy on the second medium by deriving its public key. This prompts for
the backup passphrase without writing a decrypted private key:

```sh
openssl pkey -in /second-medium/release-private.encrypted.pem \
  -pubout -out /tmp/recovered-release-public.pem
cmp /tmp/recovered-release-public.pem /secure/release-public.pem
```

Record who can recover the key and where the encrypted backup and passphrase are
kept. The backup is not verified until this comparison succeeds from the copied
file. On 1 November the operator verified an independent encrypted copy on a second
Mac; its recovered public-key SHA-256 matched the installed trust key.

Key rotation or stable-supervisor maintenance is separate from routine player
updates and currently requires operator access. Do not replace a device's trust
key with one supplied inside an untrusted downloaded release.

The repository also provides `scripts/player-signing-backup.sh`. Its `create`
command verifies the master key against the separately trusted public key,
creates an encrypted backup without overwriting an existing file, and tests
recovery through an interactive OpenSSL prompt:

```sh
sh scripts/player-signing-backup.sh create \
  --private-key /secure/release-private.pem \
  --public-key /secure/release-public.pem \
  --output /separate-backup/release-private.encrypted.pem
```

After copying it to another device or medium, use `verify --backup <copied-file>
--public-key <trusted-public-key>` there. The helper never writes a decrypted
private key. A successful same-device check does not establish an independent
backup. On 1 November the operator completed the encrypted backup and local
recovery check; the independent copy was subsequently verified on the MacBook Air with a matching
public-key SHA-256 fingerprint.

## Publishing a release

1. Freeze a reviewed core commit, run the relevant tests, and inspect the player
   changes. Confirm the tested Debian, Chromium and architecture constraints.
2. Build the signed two-file bundle with `deploy/pi-live/player_release.py build`.
   CLI-built manifests default to the pilot's tested Debian 13, Chromium 155 and
   aarch64; pass explicit options for a separately tested platform.
3. Keep release IDs immutable. Never overwrite files under an existing release
   ID or reuse an ID whose payload changed.
4. Publish the four bundle files under `player-releases/<release>/` on the
   intended environment's existing asset origin. Verify a device can download,
   authenticate and stage the exact release before adding it to the catalogue.
5. Add its metadata to `infra/functions/player-releases.mjs`; deploy the reviewed
   private club composition through the project's normal AWS checks. Preserve
   the target account, billing settings, data resources and runtime configuration.
6. Request an update for one test display through its information panel. Verify
   the installed release, completion acknowledgement, actual picture, timing,
   schedule and resolution before proceeding to any further display.

The device never takes a shell command, script path or arbitrary download URL
from an administrator. Its software command refers to an operator-published
catalogue entry and is authenticated independently of public content retrieval.

## Recovery paths

- A download or verification failure leaves the accepted release in place.
- A candidate that crashes or does not report readiness is rolled back locally.
- Reboot during probation restores the previous accepted release from the
  durable journal. Cloud connectivity is not required for this decision.
- The initial bootstrap's root-only restore script restores the former kiosk
  software while preserving current content and credentials.
- After acceptance, an administrator can use **Restore previous version** when
  the reviewed catalogue supplies a rollback target for the installed release.
  The target is downloaded, verified and activated through the same mechanism;
  content and schedules are kept. Rollback-only entries cannot be selected as
  ordinary upgrades, and the API rejects an incompatible predecessor.
  Automated readiness does not establish correct pixels.

Never fix software rollback by resetting content revisions, copying another
device's credential, or restoring a whole old cloud database over live club data.
