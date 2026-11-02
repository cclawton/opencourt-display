# OpenCourt agent guidance

These project rules supplement the user's instructions. They apply throughout this repository.

## Backlog and issue tracking

- GitHub Issues is the source of truth for outstanding work. Search existing open
  and closed issues before creating a task; update an existing issue rather than
  duplicating it. Do not maintain a competing backlog in Markdown or Beads.
- Put reusable player/control-room features, generic bugs and public documentation
  work in `cclawton/opencourt-display`. Put club-only editors, installation work,
  account operations and private diagnostic details in the club's private repository.
- Keep private details out of public issues. Split generic product work from a
  private club rollout when necessary; private issues may reference public issues.
- Link implementation commits/PRs to their issue. Record validation and remaining
  acceptance before closing; implemented code alone is not physical acceptance.
- Keep architecture, decisions, runbooks and historical evidence in documentation,
  linked from issues. When an issue exists, use it for current status rather than
  treating an old planning document as the live backlog.

## AWS work

- Use the official [Agent Toolkit for AWS](https://aws.amazon.com/products/developer-tools/agent-toolkit-for-aws/) `aws-core` plugin for AWS work.
- At the start of an AWS task, load the relevant toolkit skills. For this project those will commonly include AWS CDK, serverless, DynamoDB, IAM, billing and cost management, security, deployment, observability and Well-Architected review.
- Prefer the AWS MCP Server for current AWS documentation and AWS API interactions because it provides IAM controls and audit visibility. If it is unavailable, say so and use the AWS CLI only as a clearly identified fallback.
- Use infrastructure as code. Resources managed by this project belong in `infra/`; do not create an undocumented parallel stack with direct console or CLI commands.
- The deployment region is `ap-southeast-2` (Sydney). Check the active AWS identity and region before any bootstrap, diff or deployment. Never hard-code an AWS account ID.
- Run tests, TypeScript compilation and `cdk synth` before `cdk diff` or deployment. Review the diff before applying it.
- Do not deploy until the operator has confirmed the billing-alert email and target account. Destructive changes require explicit user approval.

## Cost and ownership guardrails

- Optimise for a small volunteer sports club: prefer serverless, on-demand and scale-to-zero services; avoid VPCs, NAT gateways, always-on compute and unnecessary cross-region traffic.
- Preserve the low-dollar AWS Budget alerts, Lambda concurrency cap, short log retention, DynamoDB retention and deletion protection unless a documented decision replaces them.
- Every supported resource must retain the application, club, deployment-stage, operational-owner, repository, data-classification and migration-target tags defined by the CDK stack.
- Keep infrastructure portable between the pilot and future club-owned AWS accounts. Follow `infra/MIGRATION.md` and preserve the one-display-at-a-time rollback path.

## Credentials and data

- Never commit AWS credentials, Google credentials, Wi-Fi passwords, tokens or resolved secret values.
- Use short-lived AWS credentials and least-privilege IAM. For future CI deployments, use GitHub OpenID Connect rather than long-lived access keys.
- Device endpoints may expose only the public display configuration projected by the API. Treat future member bookings or audit information as private data requiring a separate review.

## Display provisioning and replacement

- Transparent system cursors are a mandatory appliance setup requirement for the
  current Cage/Chromium kiosk. CSS `cursor: none` and Chromium flags alone are not
  accepted as a substitute; the Bar Prices Pi demonstrated that they are insufficient.
- Every fresh SD image, new Pi or replacement-device payload must include
  `deploy/pi-live/opencourt-transparent-cursor` and `install-transparent-cursor`,
  and the provisioning procedure must apply the fix. See
  `docs/DISPLAY_RECOVERY.md` and `deploy/pi-live/README.md` for install/restore steps.
- Existing-device player updates must preserve the installed system cursor fix.
  Do not assume it exists on a newly built appliance just because another Pi has it.
- Acceptance requires visual confirmation of no pointer after reboot and during
  image/slideshow transitions. Check Google Slides when used. Recheck after OS/theme
  maintenance, which can replace cursor files. Never declare the display ready
  based only on CSS, a running process or a file checksum.
