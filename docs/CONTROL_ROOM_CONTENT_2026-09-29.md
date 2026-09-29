# Control-room content migration — 29 September 2026

The simplified committee control room is now backed by a generic content library. The deployed `ContentItems` table was populated from the retained pilot records with:

- Saturday Morning
- Saturday Afternoon
- Monday Night
- Tuesday Mid-week Ladies
- Tuesday Night
- Wednesday Night
- Thursday Mid-week Ladies
- Thursday Night
- Honours Board

The **Displays** section selects one of these items for the migrated TV. The **Content** section supports adding, editing, replacing and deleting content. The API protects content currently shown on a display from deletion.

To repeat the migration in another club or account, deploy the stack first and run `npm run migrate-content` with the four table names and `--device-id`. The migration is idempotent and skips existing content IDs.
