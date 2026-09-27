# Product backlog

These items are explicitly outside the initial release. The MVP continues to use Google Slides as its content source and focuses on reliable scheduled court-allocation display.

## Investigate alternatives to Google Slides

Explore whether another input or authoring workflow would be easier for club volunteers while retaining Google Slides support during any transition.

The investigation should compare:

- Ease of preparing and publishing court allocations.
- Ability to trigger reliable and immediate display updates.
- Support for multiple simultaneous competitions sharing courts.
- One-off events and schedule overrides.
- Privacy, offline operation, portability, ongoing cost and vendor dependence.
- Migration from existing Google Slides without interrupting club operations.

The player should keep a content-provider boundary so a future input can be added without replacing its scheduling and display components.

## Display casual court bookings

Add casual member court bookings to the clubhouse display alongside scheduled competition and event allocations.

Discovery required before implementation:

- Identify the club's authoritative booking system and available API, export or feed.
- Decide whether bookings are merged into an allocation board, overlaid, or rotated as separate content.
- Define precedence when a casual booking overlaps a competition or one-off event.
- Agree which member details may appear on a publicly visible clubhouse TV.
- Define behaviour when the booking system is unavailable or its data is stale.

This should remain an optional integration so clubs without a compatible booking system can use the core signage application unchanged.

## Exact AWS cost allocation

After AWS exposes the deployed `Application` tag in Billing, activate it as a user-defined cost-allocation tag and change the pilot budget from its conservative Lambda/DynamoDB/CloudWatch service-family filter to `user:Application$OpenCourt Display`. Verify the tag is active and producing cost data before switching, because AWS may take up to 24 hours to make a newly applied tag available for activation.

When static control-room hosting is added, ensure its S3 and CloudFront resources use the same activated tag so the application-level budget includes the complete OpenCourt workload without including unrelated personal-account S3 or CloudFront costs.
