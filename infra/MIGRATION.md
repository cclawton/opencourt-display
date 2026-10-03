# Migrating to a club-owned AWS account

The pilot may initially run in a trusted volunteer's AWS account, but the intended production owner is the tennis club. The infrastructure is parameterised and contains no account IDs, so the same CDK stack can be deployed into a different AWS account without changing application code.

## Prepare the club account

1. Create or nominate an AWS account owned by the club, using a club-controlled email address and payment method.
2. Give at least two current office bearers recovery access, enable root-user MFA and record the succession process in the club's password manager.
3. Configure GitHub Actions access with short-lived OpenID Connect credentials when automated deployments are introduced. Do not copy a volunteer's long-lived access keys into the repository.
4. Bootstrap CDK in the club account's Melbourne-nearest supported region, `ap-southeast-2` (Sydney).
5. Confirm the club billing-alert address before deployment.

## Deploy the production copy

From `infra/`, authenticated to the club account:

```bash
npx cdk bootstrap aws://CLUB_ACCOUNT_ID/ap-southeast-2
npx cdk deploy \
  --parameters BillingAlertEmail=treasurer@example.org \
  --parameters ClubSlug=heatherdale \
  --parameters DeploymentStage=production \
  --parameters DeploymentOwner=club-owned
```

The generated resource names and tags distinguish the production club deployment from the personal pilot. Check the AWS account ID and region shown by CDK before approving the deployment.

## Back up and restore the application data

Use the repository's local [backup and restore workflow](../docs/BACKUP_RESTORE.md) to copy both device schedules, content metadata, uploaded images, audit history and convenor accounts. Take a final backup while control-room changes are paused, verify its checksums with a restore dry run against the club stack, then apply it to the empty deployment. Browser sessions are intentionally excluded, and embedded CloudFront image URLs are rewritten for the new distribution.

Backups contain convenor contact details and device authentication material. Keep them in encrypted club-controlled storage and never commit them to the repository.

Before moving a display, confirm that its production endpoint:

- returns HTTP 200 for the exact device ID;
- returns the expected schema, source and revision;
- returns the same ETag on an unchanged request; and
- returns HTTP 304 when sent that ETag.

## Move displays without downtime

Move one Pi at a time. Change only its private `/var/lib/opencourt/remote.json` URL to the production endpoint, restart the player and verify Show now, Refresh and Return to schedule. The Pi starts from its local last-known-good configuration, so restoring the pilot URL provides a simple rollback.

Observe at least one complete competition cycle before moving the next TV. Do not run bidirectional synchronisation between accounts: during the cutover, nominate one account as the source of truth and increment revisions only there.

## Retire the pilot

After all displays have used the club endpoint successfully for at least seven days:

1. save the final reviewed device configuration JSON in the club's records;
2. confirm that no Pi is requesting the pilot endpoint;
3. destroy the pilot stack; and
4. separately remove the retained, deletion-protected DynamoDB table only after the club accepts the migration and a backup is held.

Destroying the stack does not silently delete the configuration table. That is intentional protection against an accidental or premature account migration.
