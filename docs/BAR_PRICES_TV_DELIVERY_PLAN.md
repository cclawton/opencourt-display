# Bar Prices TV delivery plan

Proposed 18 October 2026. Scope: start implementation today; no claim that the full production feature is deliverable in one day.

## Agreed outcome

Configure the spare Pi 4 Model B Rev 1.4, currently reachable at 192.168.4.127, as Heatherdale's third display, named **Bar Prices TV**. Its existing Raspbian Buster installation need not be preserved. Treat the IP as temporary until device identity is provisioned.

Leave **Bar Room TV** and **Kitchen TV** software, assignments, schedules and configuration untouched. Update those appliances between seasons. Add compatibility enforcement centrally so unsupported local image slideshows cannot reach them.

Build generic image slideshows in public OpenCourt. Build the **Food/drink prices** editor as a separate Heatherdale extension, accessible through the Heatherdale interface, exporting one or more images. It must not upload, publish or assign content. Users explicitly upload the exported files into generic Single image or Image slideshow content.

## Track A: generic image slideshow and compatibility

1. Finalise a versioned source/manifest contract and tests. V1 supports ordered JPEG/PNG images, one duration, looping, fit without cropping, preview and complete revision activation. A single-image slideshow is valid. No video, transitions or mixed Google Slides/image sequencing.
2. Add an explicit `local_image_slideshow` capability with a schema version. Existing devices with no capability report are treated as unsupported. Do not infer support from a Pi model, display name or a version string alone.
3. Disable unsupported choices in the interface with a readable explanation. Enforce the same check server-side for direct selection, schedule entries/fallbacks and replacement of content already referenced by displays. A shared content edit must not silently turn a supported source into an unsupported one.
4. Example message: **“Kitchen TV cannot show image slideshows yet. Its display software needs updating. Choose a single image or Google Slides instead.”** Use the actual TV name. Keep existing content playing; do not save a partial assignment. Changing one display must not alter another display's settings.
5. Extend the local player with bounded validated downloads, staging, atomic activation, persistent last playable revision, offline cold boot and rollback. Report desired versus active revision and preparation failures accurately. Preserve legacy single-image and Google Slides paths.
6. Add Create image slideshow, Upload images, Choose existing images, order, duration, preview and Replace image to Content. Uploaded assets are reusable without a separate compulsory library-upload step. Preserve current permissions.

## Track B: Heatherdale Food/drink prices editor

1. Before adding new editor code, establish a private extension boundary. Existing honours-editor changes are present in the working tree; inventory them and preserve them. Do not accidentally publish Heatherdale editor code, artwork, dependencies or private records with the generic feature.
2. Use a separate private package/repository or private build input, with a small generic extension registration point. The public application builds and runs with no Heatherdale extension installed. Hiding a public route is not separation.
3. Keep the first editor focused: categories, item names, prices, availability and preview. Decide serving-size/price variants from the actual approved menu. Seed examples with fictional values; do not treat the obsolete video prices as authoritative.
4. Define readable landscape layouts and pagination. Export one image if everything fits, or multiple images if required. Never shrink text indefinitely to force one page. Prefer 1920×1080 for this TV's initial content.
5. Button text is Download image or Download images according to output count. The extension has no content upload, playlist publication or device selection actions. Exported files cross the boundary through the user's explicit generic upload workflow.
6. Make draft persistence explicit before club use. Do not silently inherit the honours editor's memory-only draft behaviour. Start with a versioned local draft download/import if server persistence would broaden scope; document the loss behaviour and confirm the chosen workflow before claiming readiness.

## Track C: Bar Prices TV appliance

1. Read-only inventory: RAM, architecture, SD/storage health and capacity, power warnings, network and HDMI mode. Record device identity; do not modify other Pis.
2. Prepare a current supported Raspberry Pi OS installation using the project's image approach or a documented clean installer path. Validate compatibility with the existing kiosk stack before selecting the OS release. Avoid a chain of in-place upgrades from Buster.
3. Reflashing the running root card over SSH is not the normal installation path. Arrange physical SD access and a reader (or a separately validated provisioning method). This is the main immediate hands-on dependency.
4. Provision a unique hostname/device ID and secure administration credentials; retain Wi-Fi securely, enable SSH and install only the new supported player. Remove dependency on the default password before deployment. No secrets go into source or public configuration.
5. Enrol as Bar Prices TV, assign only test artwork initially, confirm capability reporting, then test the full image slideshow flow. Replace test slides with approved exported menu images when ready.

## Start today: checkpoints

| Checkpoint | Deliverable |
| --- | --- |
| Baseline | Inventory current uncommitted work, appliance diagnostics and current content/assignment paths; preserve unrelated changes |
| Contract | Agreed image slideshow schema, compatibility rules and tests covering both legacy TVs |
| First local demonstration | Two fictional menu images looping through the local player with Wi-Fi removed; no cloud deployment required |
| Editor foundation | Private extension packaging decision and a one-page export prototype using fictional items; public core builds without it |
| Provisioning readiness | Supported OS/install path, SD access and device bootstrap checklist ready for the Pi 4 |

These are priorities, not a promise that every checkpoint finishes today. API compatibility and extension packaging may reveal additional work. Local work can proceed while physical access or deployment confirmation is pending. Parallel tracks describe independent work; actual agent delegation is optional and must be explicitly authorised.

## Estimate and release gates

- Generic slideshow including compatibility and focused regression verification: approximately 5–9 person-days (refines the earlier 4.5–8 day estimate by making compatibility explicit).
- Private extension boundary and simple editor/export: approximately 3–6 person-days, assuming fixed layouts and modest item/price fields. Inventory and extracting existing Heatherdale editor code may extend this.
- Pi provisioning and club pilot: approximately 0.5–1 person-day plus overnight soak and physical access. No Pi 3 trial is needed for this plan.
- Combined planning range: approximately 8.5–16 person-days; independent tracks can overlap. No production menu claim until current item names and prices are supplied and reviewed.

Before production: focused API/supervisor/browser regression tests, compilation/build, offline cold boot after a failed update, complete update replacement, permissions and reference/capability enforcement. Confirm Bar Room TV and Kitchen TV retain their assignments and revisions during relevant actions. Confirm the private editor does not enter public build/source outputs.

Any AWS work must load relevant toolkit skills, use AWS MCP, validate identity and Sydney region, run required tests/TypeScript compilation/synth before diff, review the diff and satisfy the target-account/billing-email confirmation before deployment. Prefer additive application/schema changes using existing infrastructure; no new cloud resource is assumed.

Pilot only Bar Prices TV. Confirm repeated cold boots, Wi-Fi recovery, overnight local playback, correct display status and a documented rollback. Keep the Android box physically available until the new display is accepted. Seasonal fleet updates are a later release step, not a prerequisite.
