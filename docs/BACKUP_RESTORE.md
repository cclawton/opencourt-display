# AWS backup and restore

OpenCourt includes a local export and restore workflow for disaster recovery and migration to a club-owned AWS account. It uses the deployed CDK stack outputs, so it contains no hard-coded account IDs or generated resource names.

The backup includes:

- both display records, including their independent schedules and device heartbeat credential hashes;
- content, legacy programme and legacy image metadata;
- the retained display-change audit history;
- uploaded images below the private S3 `display-assets/` prefix; and
- Cognito convenor names, verified contact attributes, enabled state and group membership.

Control-room browser sessions are deliberately excluded. Restored users sign in again and receive a new 90-day session. Google administrator access, Cognito/SES configuration, CloudFront, tables and buckets come from the CDK deployment rather than the data backup.

Backups contain personal contact details and device authentication material. They are written with owner-only permissions below the gitignored `.private-aws-backups/` directory. Keep a second encrypted copy in the club's password manager or encrypted backup storage; do not commit or email the directory.

## Create a backup

From `infra/`, first confirm the identity and region, then run:

```bash
aws sts get-caller-identity
aws configure get region

npm run backup -- \
  --stack OpenCourtControl \
  --region ap-southeast-2
```

Use `--profile PROFILE_NAME` when the source account uses a named AWS profile. Use `--output /absolute/private/path` to select a different local destination. The default is a new timestamped directory under `.private-aws-backups/`; the script refuses to reuse an existing directory.

Every data file and S3 object is listed in `manifest.json` with its byte size and SHA-256 checksum. The script paginates table scans and S3 listings. DynamoDB reads are strongly consistent so each individual scan page sees current committed data, but the export is not a global point-in-time snapshot across services. Avoid editing schedules or content during the short backup run.

## Verify a restore without writing

Deploy the same CDK stack in the recovery or club account first. Then authenticate to that account and run the restore command without `--apply`:

```bash
aws sts get-caller-identity

npm run restore -- \
  --backup ../.private-aws-backups/BACKUP_TIMESTAMP \
  --stack OpenCourtControl \
  --region ap-southeast-2 \
  --profile CLUB_ACCOUNT_PROFILE
```

This checks every size and checksum, reads the destination stack outputs, prints the source and target deployment identities and exits without changing AWS.

## Restore into an empty deployment

After reviewing the identity and dry-run output, add `--apply`:

```bash
npm run restore -- \
  --backup ../.private-aws-backups/BACKUP_TIMESTAMP \
  --stack OpenCourtControl \
  --region ap-southeast-2 \
  --profile CLUB_ACCOUNT_PROFILE \
  --apply
```

By default the restore refuses to run unless all five target data tables, the S3 display-assets prefix and the convenor user pool are empty. It uploads images first, restores the DynamoDB records in retrying batches, then recreates convenors without sending invitation messages. CloudFront asset URLs embedded in content, schedules and legacy metadata are rewritten from the source control-room domain to the destination domain. Google Slides URLs are unchanged.

For recovery into partially populated resources, `--overwrite` allows matching DynamoDB records and S3 objects to be replaced and existing Cognito usernames to be retained. It is a merge: records or objects that exist only in the destination are not deleted. Use it only after inspecting both sides.

For an exact rollback, `--replace` deletes the destination records in the five application data tables, objects below `display-assets/`, and convenor users before restoring the backup. It does not touch static website files, infrastructure or browser sessions. This is destructive and cannot be combined with `--overwrite`; take a fresh backup of the destination first and check the AWS identity immediately before running it:

```bash
npm run restore -- \
  --backup ../.private-aws-backups/BACKUP_TIMESTAMP \
  --stack OpenCourtControl \
  --region ap-southeast-2 \
  --replace \
  --apply
```

## Complete an account migration

After restore:

1. Deploy the static control room into the destination bucket with the destination stack's Google client configuration.
2. Verify both displays, both schedules, all content, uploaded images, convenors and audit-history counts.
3. Confirm each public device endpoint returns HTTP 200 and the expected revision.
4. Point one Pi's private `/var/lib/opencourt/remote.json` at the destination `DeviceConfigBaseUrl`, restart it and confirm its heartbeat appears. The preserved device credential hash allows it to authenticate after the URL change.
5. Test Show on TV, Refresh TV and Schedule for that display, then observe it for a full competition cycle.
6. Move the second Pi only after the first is stable. Keep the old endpoint as the rollback value until the club accepts the migration.

Do not write to both accounts during cutover. Take a final backup after freezing changes, restore it to the destination, and nominate one account as the source of truth.

## Recovery limits

- CDK must successfully recreate the infrastructure before data restore.
- The scripts do not back up AWS credentials, Google credentials, SES verification state, SMS production approval, billing configuration or DNS.
- Cognito immutable subject identifiers change when users are recreated. Historical audit records retain their original actor identifiers and email/name labels.
- A local backup protects against application-level deletion and supports account migration. It does not replace an encrypted off-computer copy or a formal recovery drill.
