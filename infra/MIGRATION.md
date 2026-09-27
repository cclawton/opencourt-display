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

## Copy configuration and verify

Device configuration currently contains only public display sources and schedules. Review the pilot JSON, then seed a new revision into the production table with the repository's `npm run seed` command. Do not blindly export and import future records if the schema later includes private booking or audit data.

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
