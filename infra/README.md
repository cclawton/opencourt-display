# AWS control plane

This package defines the deliberately small AWS control plane selected in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

The first stack contains:

- a DynamoDB on-demand table keyed by `deviceId`;
- a 128 MB ARM Lambda with reserved concurrency of five;
- an anonymous read-only Function URL at `/devices/{deviceId}/config`;
- Google ID-token protected committee routes for programme reads and display actions;
- a private S3 bucket and CloudFront distribution for the static control room;
- an authenticated image registry with short-lived, checksum-bound direct uploads to the same private bucket; and
- a retained DynamoDB audit table for every authenticated display change; and
- a retained generic content table that keeps slideshow and still-image definitions separate from device state.
- ETag/`If-None-Match` support for one-minute Pi polling; and
- an AWS Budget with actual-cost notifications at USD $1, $5 and $10, conservatively scoped to the Lambda, DynamoDB and CloudWatch service families used by the control plane.

The public device route is still read-only. Administrative writes require a Google Identity Services ID token, an exact email allow-list and (when configured) a Google Workspace hosted-domain check. Tokens are verified server-side with Google's maintained Node auth library; they are never stored on the Pi or in local storage.

Admin routes are:

- `GET /admin/content` to list ready slideshows and still images.
- `POST /admin/content` and `PUT /admin/content/{contentId}` to create/edit Google Slides entries.
- `POST /admin/content/images/uploads` and `POST /admin/content/{contentId}/complete` to create or replace verified JPEG/PNG entries.
- `DELETE /admin/content/{contentId}` to delete unused content. The API refuses to delete the content currently shown on a display.
- `GET /admin/devices/{deviceId}`
- `POST /admin/devices/{deviceId}/actions` with `show_content` or `refresh` for the current control room. Legacy programme/image actions remain during migration and rollback.

S3 remains private and has no anonymous write path; the browser receives a signed URL for one specific object, checksum and content type. The displayed image URL is public through CloudFront because a clubhouse Pi must download it without storing committee credentials. Replacements use versioned object keys so an active display never loses its last-known-good image.

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

The initial service-family budget filter covers Lambda, DynamoDB, CloudWatch, S3 and CloudFront. In a shared account it can still include another workload using one of those services. Activate the `Application` user-defined cost-allocation tag when it becomes available in Billing, then replace this transitional filter with `user:Application$OpenCourt Display`. AWS may take up to 24 hours to make a newly applied tag available for activation.

The image feature adds no server or always-on process: it reuses the existing private S3 bucket, CloudFront distribution and on-demand Lambda. Its variable usage is limited to stored image bytes, upload/download requests, a small DynamoDB metadata item and CloudFront transfer. Pending uploads are never listed as selectable. CloudTrail S3 data events can be enabled later if the club needs object-level audit logs, but they are omitted from the tiny-club default to avoid unnecessary logging cost; display changes themselves remain in the retained audit table.

The initial seed is a local administrative action, not a public API. After deploying the updated stack, migrate the retained device/programme/image records into the content table:

```bash
npm run seed -- \
  --table opencourt-heatherdale-pilot-device-configurations \
  --file examples/honours-board-tv.json \
  --region ap-southeast-2

npm run seed-programmes -- \
  --table opencourt-heatherdale-pilot-programmes \
  --file ../.private-pi-audit/2026-09-27/programmes.json \
  --region ap-southeast-2

npm run migrate-content -- \
  --device-table opencourt-heatherdale-pilot-device-configurations \
  --programme-table opencourt-heatherdale-pilot-programmes \
  --asset-table opencourt-heatherdale-pilot-display-assets \
  --content-table opencourt-heatherdale-pilot-content-items \
  --region ap-southeast-2
```

The command rejects unsafe provider URLs and uses a conditional write: only a strictly newer revision can replace an existing item.

## Static control-room deployment

After the CDK stack is deployed and the web application has been built, publish the static site with:

```bash
npm run deploy:static -- --google-client-id YOUR_WEB_CLIENT_ID
```

The script reads the stack outputs, writes a temporary runtime configuration, uploads the Vite assets to the private bucket, sets short caching for the HTML and runtime configuration, invalidates CloudFront and restores the local placeholder file. The site uses an S3 origin access control; the bucket is never public. CloudFront security response headers include CSP, HSTS, `X-Frame-Options` and `X-Content-Type-Options`.
