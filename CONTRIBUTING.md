# Contributing

Thank you for helping community tennis clubs run reliable court displays.

## Backlog and proposals

[GitHub Issues](https://github.com/cclawton/opencourt-display/issues) is the
authoritative backlog. Search existing open and closed issues before opening a
bug, feature request or investigation. Describe the problem, desired outcome and
acceptance checks; use `bug`, `enhancement`, `question` or `documentation` as
appropriate. A proposed feature is not a promised delivery date.

Keep reusable OpenCourt work public. Club-only editor requests, deployment tasks
and private operational details belong in the relevant club's private repository.
Never include credentials or private member/booking data in public issues.

Reference the issue in implementation commits or pull requests. Close it with
validation evidence only after its acceptance checks pass. Runbooks and design
decisions remain in documentation; do not duplicate the backlog in Markdown or
another tracker.

## Clean-room rule

Contributions must be independently written. Do not copy source code, scripts, configuration, documentation or distinctive assets from an earlier club installation unless its copyright owner has explicitly licensed that material for this repository.

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

Keep club-specific examples free of player names, passwords, credentials and private booking information. New integrations should be optional and should preserve the core player when their external service is unavailable.
