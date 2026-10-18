import { test, expect } from './fixture';

test('default build contains only core navigation', async ({ page, room }) => {
  test.skip(
    Boolean(process.env.OPENCOURT_EXTENSIONS_ENTRY),
    'Optional extensions add their own navigation.',
  );
  expect(room.writes).toHaveLength(0);
  await expect(
    page.getByLabel('Control room sections').getByRole('button'),
  ).toHaveText(['Displays', 'Content', 'Users', 'Schedule']);
});
