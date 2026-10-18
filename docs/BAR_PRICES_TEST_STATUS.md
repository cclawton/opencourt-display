# Bar Prices TV test status — 18 October 2026

## Deployed

- Website: https://dq7sf412ko44q.cloudfront.net
- Separate stack: `OpenCourtHeatherdaleTest`, Sydney, deployment stage `test`.
- Same AWS account and billing-alert email as the existing pilot, explicitly confirmed by the operator. Test administrator access is restricted to the operator’s nominated Gmail identity.
- Stack creation completed, termination protection enabled. Existing budgets, concurrency cap, retention/deletion protection and resource tags are retained.
- Production `OpenCourtControl`, Bar Room TV and Kitchen TV were not updated. New SES identities were deliberately not created; test composition reuses the verified account/region identities.
- Test data: two 1920×1080 sample-price menu images, one image slideshow, one Bar Prices TV device record and empty honours-board editor data. No real member/honours records were copied.

The test display starts with one sample image. Slideshow support is deliberately not asserted in advance: after its new player reports capabilities, an administrator can choose **Sample bar prices** on Displays. This preserves the rule that an old or unknown player cannot receive a local slideshow.

## Verified

- 38 generic infrastructure tests, 11 private backend/infrastructure tests and 21 supervisor/browser-harness tests passed.
- Public and Heatherdale builds and TypeScript compilation passed. Public browser checks (32) and private editor checks (6) passed on desktop and mobile, including separate public/private boundaries, PNG/ZIP exports and saved-menu round trips, page creation, picture uploads and conflict recovery.
- Local CDK diff and the AWS change set contained additions to the isolated test stack only. Production resources were not changed.
- Live test website: HTTP 200 and visible TEST badge; public Bar Prices TV config: 200; conditional fetch: 304; unauthenticated private honours endpoint: 401; sample image: 200.
- Actual Chromium advanced between the two cached slides with all HTTP requests blocked. This verifies the local player on the development machine, not yet the reimaged physical Pi.
- Private backend composition preserves the original honours table logical ID, properties, read-only IAM and retention protections for a later reviewed production migration.

## Remaining operator steps

1. Google OAuth origin setup is complete and the operator has confirmed Gmail sign-in on the test site. Refresh the site to use the revised menu editor.
2. When the new card arrives, use Raspberry Pi Imager to install Raspberry Pi OS Lite (64-bit), configure the home Wi-Fi, hostname `opencourt-bar-prices`, user `opencourt`, a unique password and SSH.
3. Transfer the private prepared payload, then install and run acceptance on the actual Pi/TV. Do not share the payload: its `remote.json` contains this test device's unique status credential.
4. Confirm Wi-Fi recovery, actual 1080p HDMI, repeated cold boots, interrupted updates and overnight playback. The physical Pi has only received read-only diagnostic checks so far.
5. Later, review/promote the exact tested release and enrol only Bar Prices TV in production. Existing display software updates remain deferred until between seasons.

## Source control and operational limits

Heatherdale editor/frontend/backend source lives in a separate local Git repository at `.private-extensions/heatherdale`, ignored by the public checkout. The private repository has been pushed to private GitHub repository `cclawton/heatherdale-opencourt`. Public implementation work is saved on `codex/local-slideshow-club-extensions` for review, with no merge to main or production deployment. The private core snapshot pins this development checkpoint; this is not a released production version.

Food/drink menus now use Save changes and reopen from a private retained S3 bucket through the authenticated administrator API. Writes use revision and ETag checks to prevent overwriting concurrent edits. Named pages support up to four items each, with Add picture buttons and a large logo-only display layout. The existing private backup script covers honours data; menu-draft S3 backup integration remains a follow-up. Menu images are ordinary exports, with no publishing API calls from either editor. Saving a generic slideshow does not automatically change existing device/schedule snapshots: select it again on Displays or save the relevant schedule to publish the new version.

Image cache files are reused by checksum across revisions. Automatic removal of obsolete cached revisions remains a follow-up; monitor storage during the pilot. Destructive test cleanup requires explicit approval because retained/deletion-protected data and termination protection are deliberate. Review test ownership/cleanup when the pilot is accepted.

## Pause checkpoint — 18 October 2026

Both repositories are saved to GitHub. The test site has the revised saved-menu editor; production and the existing club players are unchanged. Next: prepare the new SD card, provision Bar Prices TV, then run physical HDMI, reboot, offline and overnight playback acceptance. Menu S3 backup integration and obsolete player-cache cleanup remain follow-ups. Review and merge the public development branch before a production promotion.
