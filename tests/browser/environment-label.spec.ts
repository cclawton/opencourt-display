import { test, expect } from './fixture';
test.use({ environmentLabel: 'TEST' });
test('clearly labels the test environment in the control-room header', async ({
  page,
  room,
}) => {
  expect(room.writes).toHaveLength(0);
  await expect(page.getByText('TEST', { exact: true })).toBeVisible();
  await expect(page.getByText('TEST', { exact: true })).toHaveClass(
    /bg-amber-300/,
  );
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await expect(page.getByText('TEST', { exact: true })).toBeVisible();
});
