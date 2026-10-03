# OpenCourt control-room test plan

This plan covers the public committee control room, its authenticated AWS API, and the Raspberry Pi player. It is designed to be repeatable before a committee demonstration and after every deployment.

## Safety and exit criteria

- Record the starting device revision and selection before changing anything.
- Use the Heatherdale pilot device only: `honours-board-tv` in `ap-southeast-2`.
- Never record Google tokens, AWS credentials or Wi-Fi passwords in test output.
- Restore the starting selection after the live test loop.
- A run passes only when every expected response is observed, the device revision changes exactly once per successful action, and CloudWatch records no new application errors or throttles.

## Automated checks

Run from the repository root:

```bash
npm run lint
npm run build
npm test
npm --prefix infra test
npm --prefix infra run synth -- --strict
```

The suites must cover:

- public device configuration projection and ETag handling;
- authentication required on every `/admin` route;
- programme, image and device reads;
- all display actions and optimistic revision writes;
- image type, size, dimension and checksum validation;
- Lambda IAM permission to read and write the device table;
- CORS ownership by the Lambda Function URL, with no duplicate origin header.

## Browser UX automation

See [BROWSER_UX_TESTS.md](BROWSER_UX_TESTS.md) for desktop/mobile tests against the deployed static application, with a read-only smoke test and isolated committee workflows. This suite does not change the live TV or verify actual authenticated API writes.

## Live browser acceptance loop

1. Open the CloudFront control room and reload once.
2. Confirm the signed-out page exposes no committee controls.
3. Select a convenor with both delivery methods and confirm the selector offers **Email** and **SMS**. Request an email code, sign in, reload the browser and confirm the convenor remains signed in. Confirm this role can change or refresh an existing display but cannot see Users, add or delete content, or edit schedules. Sign out.
4. Sign in with an approved club Google account.
5. Confirm the current TV selection is shown and no error banner is present.
6. In **Schedule**, confirm the fallback is Honours Board and the weekly entries match the approved timetable. Save a harmless edit, then select **Schedule** in the Displays dropdown and confirm it becomes the selected mode.
7. Select each court allocation once:
   - Saturday Morning
   - Saturday Afternoon
   - Monday Night
   - Tuesday Mid-week Ladies
   - Tuesday Night
   - Wednesday Night
   - Thursday Mid-week Ladies
   - Thursday Night
8. After each selection, confirm:
   - the success banner says the content should appear within one minute;
   - that allocation is marked **On <display name>** (for example, **On Bar Room TV** or **On Kitchen TV**), with one badge per configured display currently showing it;
   - the API device record names the same content item;
   - the public device endpoint returns the same revision and source.
9. Choose **Honours Board** and click **Show on TV**; confirm it becomes the current source.
10. Select **Refresh TV** and confirm one new revision is created without changing the source.
11. Restore the recorded starting content with **Show on TV**. The simplified control room has no restore-default button.
12. In Content, edit a slideshow title/URL, add an image, replace it, and delete an unused item. Confirm the currently displayed item cannot be deleted.
13. Upload a non-sensitive JPEG or PNG test image, confirm it appears in the library, display it temporarily, then restore the recorded starting content. The simplified control room has no **Use as honours** action.
14. Sign out and confirm the controls disappear.

## AWS verification

- Function URL preflight returns one allowed origin for the CloudFront domain.
- Lambda `Errors`, `Throttles` and Function URL 5xx metrics remain zero throughout the loop.
- CloudWatch contains no new `control_api_error` entries.
- DynamoDB contains the final expected revision and selection.
- The retained audit table contains one entry per successful display change.
- The Pi accepts the final revision within its configured poll interval and retains its previous display if any download fails.

## Regression loop

If any step fails: capture the exact browser message, correlate its timestamp with CloudWatch, add an automated regression test, apply the smallest fix through CDK, rerun all automated checks, and restart the live loop from step 1. Do not call the release error-free until a complete loop passes.
