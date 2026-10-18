# Heatherdale extension packaging proposal

Use two independent version-controlled repositories:

- Public `opencourt-display`: generic display player, content, image slideshows, schedules, permissions and a small optional extension interface. Builds/tests without Heatherdale packages or credentials.
- Private `heatherdale-opencourt`: honours-board editor, Food/drink prices editor, club artwork, sample menu assets and composition/build configuration. Pin the public core to an exact commit or released package version. A public-core submodule inside this private repository is an acceptable initial mechanism; never put a required private submodule into the public repository.

The private build composes the core and editors into the Heatherdale interface. Public releases come from public CI; Heatherdale builds come from private CI. Record both core and extension revisions with each Heatherdale release, and retain the lockfile/pinned core revision for rollback. Core fixes go to the public repository, editor changes to the private repository. Do not maintain a permanently diverging private copy of the entire core.

Private source control does not make downloaded browser JavaScript confidential. Ship only the client code required by authorised users, enforce permissions server-side and keep private records out of bundles. This boundary is for ownership, maintainability and distribution; it is not a mechanism for hiding browser-delivered source from its users.

Before a public release, inventory working-tree changes and Git history. Existing honours editor files are currently untracked, while some integration changes are mixed into modified shared files. Extract carefully; preserve unrelated work. If club-specific content has already been published, moving it later does not retract its earlier publication. No repository creation, history rewriting or push is performed by this proposal.

## Menu test-data brief

Use the supplied video as an explicitly obsolete test fixture. Visible category prices: beers $5; ciders $5; premixes $6–$8; soft drinks $2.50; chips $5. Wine prices are not legible/present in the sampled wine slide: keep them unset rather than inventing them. Premix range does not establish an individual price for every can.

Identified examples suitable for initial artwork: Carlton Draught, Somersby apple/pear cider, Coca-Cola, Smith's chips and Pepperjack wine. Other bottle labels/variants require closer confirmation before treating them as exact inventory. Reproduce the Heatherdale H-and-dot identity using club artwork where available; verify the existing logo asset visually before assuming it matches the bar mark.

Candidate product-image sources found 18 October 2026:

- Carlton Draught official product imagery: https://carltondraught.com.au/our-beer
- Carlton bottle image candidate: https://parkhillcellars.com.au/cdn/shop/files/CARLTON_DRAUGHT_BOTTLE_375ML.png?v=1744963524&width=1600
- Somersby apple product imagery: https://www.somersby.com/en-sg/products/apple/
- Somersby pear product imagery: https://www.somersby.com/en-sg/products/pear
- Coca-Cola Australian brands: https://www.coca-cola.com/au/en/brands
- Pepperjack brand/product references: https://www.pepperjack.com.au/about

These are source candidates, not a completed downloaded asset pack or an assertion of open-source redistribution rights. Keep selected branded test assets and their source manifest in the Heatherdale private repository rather than the generic project's distributable examples. Refresh menu data later without changing generic playback.

## Pi assessment

Read-only SSH inspection confirmed Raspberry Pi 4 Model B Rev 1.4, approximately 8 GB RAM, roughly 29 GB root filesystem, `get_throttled=0x0`, and current HDMI output 1024×768 at 60 Hz. Current Buster userspace is `armv7l`; that does not restrict the Pi's ability to run a fresh 64-bit OS. No configuration was changed by these checks.

Engineering judgment: sufficient hardware capacity for one 1080p local JPEG/PNG slideshow in a minimal Chromium kiosk. Validate the individual board, fresh OS, HDMI/TV, power and thermal behaviour through repeated boots and overnight playback before declaring the appliance accepted. Current 1024×768 output does not verify the club TV's 1080p mode.

Purchase target: reputable 32 GB or larger microSD (high endurance preferred), Pi 4 Model B case with ventilation/cooling, appropriate micro-HDMI cable, and reliable 5.1 V/3 A USB-C supply. No new Pi is indicated by the capacity assessment. Final purchasing choices depend on existing accessories and are separate from individual-device reliability acceptance.
