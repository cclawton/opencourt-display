# Isolated Bar Prices TV test rollout

For the actual deployed environment and remaining setup, see [test status](BAR_PRICES_TEST_STATUS.md).

The club Pis and a home Pi can technically share a cloud backend: each appliance polls its configured HTTPS endpoint over an outbound connection. Local Wi-Fi membership does not constrain that connection. For the new slideshow and extension work, use a separate test deployment so prototype releases do not change the live control plane.

## Isolation

- Separate CDK stack, resource prefix, configuration/content tables, website/assets and device authentication. Use deployment stage `test`; never reuse production table names, content URLs or device tokens in fixtures.
- Enrol only `bar-prices-tv`, displayed as **Bar Prices TV**. Do not enrol Bar Room TV or Kitchen TV in the test environment.
- Use the private Heatherdale composition for the test site, with a prominent TEST banner and sample prices. Core CI/builds must work without private extension source.
- Start with fictional/obsolete menu data and the approved reference images. No member or honours records are required for slideshow testing.
- Preserve the project's low-dollar budget alerts, concurrency limit, resource tags, retained/deletion-protected data and short log retention. A test environment is not permission to bypass those controls.

## Provision the new card

Use a supported Raspberry Pi OS 64-bit release validated against the kiosk installer. Flash a new card through Raspberry Pi Imager, configure the home Wi-Fi, unique hostname `opencourt-bar-prices`, SSH and a unique administrator credential. No club secrets are embedded in a shared image. The existing Buster card can remain a physical fallback while the new card is tested.

The image definition under `image/` currently launches the browser-based application and is not automatically the same appliance path as `deploy/pi-live/`'s local offline player. For this pilot, use a clean OS plus the generic local-player installer under `deploy/pi-live/`; do not claim the image generator already packages the new offline player.

Prepare a payload containing the current installer/player and explicit initial device config with local sample images. Its remote settings must use the TEST API and separately provisioned test device credential. Never transfer another display's remote.json/token. Confirm HDMI at 1920×1080 on the actual target TV; the current 1024×768 reading is only a desktop monitor observation.

## Acceptance before production

1. Create a Single image and an Image slideshow through test Content; test one-image and multi-image output from the private editor.
2. Confirm image order/timing, original image dimensions and readable prices on the actual TV.
3. Disconnect Wi-Fi, reboot, and confirm the complete last accepted slideshow plays.
4. Interrupt an update/download and reboot again; the previous complete slideshow must remain available.
5. Restore Wi-Fi and confirm the new complete revision becomes active. Verify desired/active status labels are truthful; a received config is not proof of pixels on the screen.
6. Test a simulated legacy device with no slideshow capability: direct assignment and schedules must fail with a useful message and no mutation. Do not use real club displays for that test.
7. Run overnight and inspect power/thermal warnings, memory use, storage and browser recovery.

## Promotion

Record the tested public-core commit and private-extension commit. Promote that exact release to production through the normal reviewed deployment workflow, keeping all existing device source formats valid. Preserve the private honours-table resource identity through Heatherdale's private infrastructure composition; a generic-core-only production deployment is not interchangeable with the Heatherdale deployment.

Create the production Bar Prices TV record and new credential through the supported provisioning process. Transfer approved images/slideshow through an explicit, validated content export/import or re-upload, not a bulk replacement of production data. Update only this Pi's endpoint/credential, verify a complete download, and retain a local fallback for the switch. Existing two Pis remain on their current software and assignments.

## Teardown

Do not promise automatic disposal: retained tables, deletion protection and non-empty asset storage deliberately survive casual stack deletion. After the pilot, inventory test resources and retained data, record the tested release and obtain explicit approval for destructive cleanup. Add a dated owner/removal review to the test runbook. No automatic scheduled cleanup is created by this document.

## Deployment gate

Before any deployment, confirm the target account and billing-alert email, check identity and Sydney region through AWS MCP, run required tests/TypeScript compilation/CDK synth, and review the CDK diff. These are repository requirements. The initial test deployment has now been created after these checks; consult the linked status document.
