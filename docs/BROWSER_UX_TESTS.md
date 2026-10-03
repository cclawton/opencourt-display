# Browser UX tests

Run from the repository root with Node 22.13 or newer:

```sh
npm ci
npx playwright install chromium
CONTROL_ROOM_URL=https://YOUR_DISTRIBUTION.cloudfront.net npm run test:browser
npm run test:browser:report
```

The URL must identify the intended deployed control room. No AWS credentials, Google tokens, or stored browser sessions are required. Tests do not deploy anything.

## Two layers of evidence

- `live-smoke.spec.ts` loads the real HTML, runtime configuration, application assets and Google sign-in integration. It checks the signed-out boundary, runtime settings, uncaught JavaScript errors and viewport overflow. It blocks admin requests and non-read requests.
- `control-room.spec.ts` loads those same deployed application assets, but substitutes Google Identity Services and intercepts every admin request with an isolated in-memory library of eight named slideshows and the Honours Board. It exercises selection, refresh, slideshow create/edit/delete, active-item deletion protection, image upload/replacement, validation and conflict feedback, cancellation, sign-out and reload. This proves browser behaviour against controlled API responses, **not** real authentication, the live seed contents, server-side validation, S3 uploads or Pi delivery.

Every scenario runs in desktop Chromium and a mobile Chromium viewport. The mobile project is emulation, not testing on an actual Android phone. Each test gets its own browser context and fixture state. The fixture permits only same-origin static reads, explicitly mocked Google sign-in, mocked API requests and mocked image uploads; unexpected network requests fail the test. Service workers are blocked so they cannot bypass interception. The fake token cannot authenticate with the live service.

Failure screenshots, traces and the HTML report are ignored by Git. They can contain deployment URLs and page content; review before sharing. No real credentials should be added to fixtures or test configuration.

## Local harness verification

```sh
BROWSER_TEST_LOCAL=1 npm run test:browser
```

This starts Vite on port 4173, supplies dummy runtime settings, and runs only the isolated workflow suite. It does **not** constitute deployed acceptance. Leave that environment variable unset for CloudFront runs.

## Remaining live acceptance

Use an approved Google account for a supervised read-only check of the actual nine library items and current TV selection. Verify real sign-out and account rejection as appropriate. Live mutations, API authorization, audit records and Pi delivery remain separate checks described in [TEST_PLAN.md](TEST_PLAN.md). Passing mocked workflows does not establish those properties. Any proposed deployment must follow AGENTS.md and be supported by a reproduced finding.

## Verification record — 3 October 2026

The deployed CloudFront suite passed 26/26 checks across desktop and mobile Chromium after commit `bf8c7f0` was deployed. This includes the signed-out live smoke checks and isolated workflows for both roles. The convenor regression verifies that Displays and Schedule are available, a schedule can be saved, and the admin-only Content and Users sections remain hidden. Lint, TypeScript compilation, the production build, 22 infrastructure tests, 14 Pi/player tests and CDK synthesis also passed. The CloudFormation stack finished in `UPDATE_COMPLETE`, and its CloudFront invalidation completed before the deployed suite ran.

The automated role workflows still use intercepted API responses and do not consume a real OTP. Craig subsequently completed a supervised email-OTP login against the deployed system. Both configured pilot convenors now have verified email attributes and email/SMS delivery choices.
