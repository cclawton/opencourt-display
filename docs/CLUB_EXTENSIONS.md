# Optional club extensions

Status: implemented in the development checkout and an isolated club test deployment. The generic hooks and local slideshow implementation are checkpointed on `codex/local-slideshow-club-extensions`; they have not been merged into `main` or released. This is a small composition interface under development, not a stable plugin SDK or extension marketplace.

## Ownership and repositories

| Public OpenCourt repository | Club extension repository |
| --- | --- |
| Player, content library, image/slideshow delivery, schedules, permissions, device capabilities | Specialist editors, club-specific layouts and artwork, private record validation and storage adapters |
| Generic extension interface and authenticated backend hook | Club build entry point, backend handler and infrastructure composition |
| Public tests, fictional fixtures, generic fixes | Club-specific tests and appropriately controlled sample assets |

The club repository can be private or public according to the club’s needs and asset rights. The public build has an empty editor registry and must build and test without access to any private repository. Do not add a required private dependency or private submodule to the public project.

Keep the repositories independent rather than maintaining a permanently diverging copy of the whole application. A private repository may pin a public core checkout or submodule. In the current development workspace the club checkout sits in an ignored `.private-extensions/` directory inside the core checkout. That directory layout is a development convenience, not a deployment or security boundary.

## A simple, explicit user workflow

**Club editor → download image(s) → generic Content → select a Display or Schedule.**

Editors can save editable source through their own authenticated backend. They export ordinary PNG/JPEG images for users to upload separately. One image can remain a single image; several can become an image slideshow on a supporting player. A ZIP download must be extracted before uploading its individual images.

There is deliberately no automatic publish action from the club editor. Generic OpenCourt does not need to understand honours records, drinks, prices or a particular club’s layout. Changing a saved menu does not silently update an uploaded image, slideshow, device or schedule. Existing content references are snapshots: reselect updated content or resave the schedule when publishing a new version.

## Composition in the developing implementation

The frontend build uses `OPENCOURT_EXTENSIONS_ENTRY` to select a club-owned module instead of the empty public registry. That module exports editor entries containing an ID, navigation label and React component. The component receives runtime configuration, the authenticated session token and an optional unsaved-change callback. Private builds add the editor navigation for administrators; public builds omit it. The build includes the selected extension’s styles.

The backend accepts a club-owned administrator hook after authentication and administrator authorisation. A private handler composes it with the generic API. Hiding navigation is not access control: every private endpoint must enforce the server-side boundary and validate its requests.

Infrastructure uses a private CDK entry point and a composition callback to add the club’s resources and least-privilege grants to the common stack. Public templates omit those resources. When migrating an existing club, preserve its resource identities, retention, backups and deployment parameters. Never apply a generic-only template over a deployment that owns private extension resources.

For example, a club can include an honours-board editor and a food/drink prices editor in the same interface. Their records, layout code and product artwork stay in the club repository. Their exported images use the common content library and the same player as any externally authored poster.

The exact interfaces are currently evolving. After the core implementation is published, refer to its extension contract, Vite build configuration, backend hook and CDK stack options at the pinned revision rather than copying examples from a different release.

## Privacy and credentials

A private Git repository controls source distribution; browser-delivered JavaScript and artwork remain inspectable by users who receive them. Keep confidential records, credentials and privileged operations on the backend. Export only content intended for display. A Pi receives the public display configuration and assets, not editor drafts or administrative credentials.

Do not commit Wi-Fi passwords, OAuth secrets, AWS credentials, session tokens, device credentials, private data exports or generated deployment payloads to either repository. Club artwork and third-party product photographs also need an appropriate distribution policy; placing them in a private repository does not grant new reuse rights.

## Releases, checks and operations

1. Contribute generic fixes and features to the public core; keep club-specific changes in the extension repository.
2. Pin an exact public core commit and the extension commit for each club release. Record runtime/dependency versions and retain lockfiles. Do not label an uncommitted working tree a reproducible release.
3. Test the public build without private files, then test the combined club build and authenticated backend boundaries.
4. Review the club-composed infrastructure diff and deploy to an isolated test environment first.
5. Promote to one display at a time, with a known rollback revision. Device capability checks allow older players to keep operating during rollout.
6. Include extension data in club backup/restore procedures explicitly. The generic backup tool does not automatically discover private stores. Verify restore coverage before relying on it.

This model supports separately owned deployments for many clubs. It does not require a centrally hosted multi-club service, and it does not yet provide automatic extension discovery, compatibility resolution or independent hot installation.
