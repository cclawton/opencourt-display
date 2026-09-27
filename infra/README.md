# AWS control plane

This package defines the deliberately small AWS control plane selected in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

The first stack contains:

- a DynamoDB on-demand table keyed by `deviceId`;
- a 128 MB ARM Lambda with reserved concurrency of two;
- an anonymous read-only Function URL at `/devices/{deviceId}/config`;
- ETag/`If-None-Match` support for one-minute Pi polling; and
- an AWS Budget with actual-cost notifications at USD $1, $5 and $10, conservatively scoped to the Lambda, DynamoDB and CloudWatch service families used by the control plane.

There is intentionally no administrative write route in this increment. A public write endpoint would let anyone change the clubhouse TV. Administrative writes will be added only with Google ID-token verification and an explicit club-email allow-list.

## Local verification

```bash
npm install
npm test
npm run build
npm run synth
```

## Deployment guardrails

Deployment requires an explicit billing-alert email:

```bash
npx cdk deploy \
  --parameters BillingAlertEmail=owner@example.com \
  --parameters ClubSlug=heatherdale \
  --parameters DeploymentStage=pilot \
  --parameters DeploymentOwner=personal-pilot
```

Do not deploy until the target AWS account and region have been confirmed. After deployment, seed the table with an approved device configuration, test the read-only endpoint and only then place its HTTPS URL in the Pi's private `/var/lib/opencourt/remote.json` bootstrap file.

The parameters keep resource names and ownership tags portable. The application stack has termination protection, the table is retained and deletion-protected, and the Lambda logs are intentionally short-lived. Bootstrap with termination protection as well. See [MIGRATION.md](MIGRATION.md) for the later move to a club-owned AWS account.

The initial service-family budget filter prevents unrelated account services such as Lightsail, Route 53 and S3 from being reported as OpenCourt spend. In a shared account it can still include another workload's Lambda, DynamoDB or CloudWatch usage. Activate the `Application` user-defined cost-allocation tag when it becomes available in Billing, then replace this transitional filter with `user:Application$OpenCourt Display`. AWS may take up to 24 hours to make a newly applied tag available for activation.

The initial seed is a local administrative action, not a public API:

```bash
npm run seed -- \
  --table opencourt-heatherdale-pilot-device-configurations \
  --file examples/honours-board-tv.json \
  --region ap-southeast-2
```

The command rejects unsafe provider URLs and uses a conditional write: only a strictly newer revision can replace an existing item.
