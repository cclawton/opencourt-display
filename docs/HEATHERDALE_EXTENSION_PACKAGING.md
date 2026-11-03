# Private club extension packaging

Keep the generic application and a club’s optional tools in independent repositories:

- Public core: player, content library, image slideshows, schedules, permissions and the optional extension interface. It must build and test without private packages, artwork or credentials.
- Private club extensions: specialist editors, club artwork/records and deployment composition. Keep the actual repository name and local operational paths in private onboarding records.

Pin the public core to an exact commit or released package version. A public-core submodule inside the private repository is an acceptable initial mechanism; never require a private submodule in the public repository. Record core and extension revisions for rollback. Fix core behaviour publicly and club-specific editor behaviour privately rather than maintaining a permanently diverging private copy of the core.

Public builds use the empty editor registry. A private build selects its optional editor entry using `OPENCOURT_EXTENSIONS_ENTRY`; keep that entry and its dependencies out of generic builds. Private deployment composition adds the required authenticated API/data resources and preserves existing logical resource identities. Never deploy the generic stack over an extension deployment without reviewing the full diff.

Private source control does not make browser-delivered JavaScript confidential. Enforce permissions server-side, keep private records out of bundles and public device projections, and review the ownership/licence of artwork before redistribution. Editors can export image(s) that enter the generic image/slideshow workflow; do not couple generic playback to a club’s record schemas.

Club inventories, device inspections, purchasing decisions, historical test data, support cases and real deployment targets belong in the club’s private documentation. Public examples should be fictional and clearly labelled.

Before publishing, review both changed files and their linked documentation for secrets and deployment-specific metadata. Moving details into a private repository does not retract earlier public Git commits.
