# One platform for club displays

OpenCourt started with tennis court allocations. Its shared display system also suits honours boards, events and marketing, and food/drink prices. A club can use any combination of these without needing a separate signage product for each purpose.

## Words people see in the interface

- **Displays:** the physical TVs. Choose what a TV should show and check its connection.
- **Content:** named images, presentations and, on the developing version, image slideshows that can be reused on different TVs.
- **Image slideshow:** pictures shown one after another, in a chosen order, for a chosen number of seconds. “Playlist” is a useful architectural term; the volunteer-facing name is “image slideshow”.
- **Schedule:** when a TV should show particular content.
- **Optional club editor:** a tool for preparing artwork, such as an honours board or menu. It produces images for Content; saving the editor does not publish to a TV.

One image is a complete use case. A club does not need to create a slideshow just to show one poster or menu page.

## Four common workflows

### Honours board

Prepare a board with an external design tool or a club-specific editor. Download the finished image and upload it in Content. Select it for the honours TV. Keep structured records and private member details in the authoring system; export only information approved for public display.

### Court or facility allocations

Prepare the complete allocation for a session in Google Slides or an image. Use Displays for a manual selection, or Schedule for recurring sessions. One presentation can cover simultaneous activities. Clubs with pitches or rinks can use the same delivery approach; OpenCourt is not a booking system.

### Events and marketing

Upload a finished event poster or sponsor image. Show one image, or use an image slideshow to rotate several posters on a compatible player. Arrange images and choose the time per image. Remove or replace outdated artwork explicitly: automatic campaign expiry and event feeds are future possibilities, not current guarantees.

### Food/drink prices

Prepare one or more menu pages with large readable prices and product pictures. A club’s optional menu editor can simplify this work. Save the editable menu, download the image(s), and upload them in Content. Choose a single image for a one-page menu, or an image slideshow for several pages. Assign it to the bar or café TV. A saved price change reaches the TV only after the new images are uploaded and the display selection or schedule is updated.

## Other uses of the same tools

Coaching timetables, junior programme notices, opening hours, facility rules, wayfinding, volunteering, fixtures, results and committee notices can use the same image/presentation workflows. These are content scenarios, not claims that specialist integrations exist. Consider permission to display personal details, especially information about children.

## What works where

| Capability | Published core | Development/test version |
| --- | --- | --- |
| Google Slides, still images, content selection and schedules | Available | Retained |
| Local image slideshow with cached images | Development branch only | Implemented and tested; physical appliance acceptance remains part of rollout |
| Optional club editor composition | Development branch only | Implemented and tested with separate private club code |
| Mixed images/Slides/video playlists, automatic expiry, bookings/POS/live-result integrations | Not provided by this work | Future possibilities requiring separate design |

Google Slides needs network access. The developing image slideshow downloads a complete revision before activating it and retains a playable cached revision for offline use, including restart. That does not make outdated prices or allocations current: clubs still own content review.

Existing TVs can keep their current software and content while a new player is tested. The developing API checks player capability and rejects an image slideshow for an older player with an explanatory message. Upgrade and validate displays individually; new software does not have to be installed everywhere at once.

See [Club extensions](CLUB_EXTENSIONS.md) for how specialist authoring remains separate from this common delivery system.
