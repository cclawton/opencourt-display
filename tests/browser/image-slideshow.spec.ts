import { test, expect } from './fixture';

test('creates an image slideshow directly using existing pictures and explains older TVs', async ({
  page,
  room,
}) => {
  await expect(
    page.getByText(/cannot show image slideshows yet/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page
    .getByRole('button', { name: 'Add image slideshow', exact: true })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Bar prices');
  await page.getByLabel('Choose existing images').selectOption('fixture-8');
  await page.getByLabel('Choose existing images').selectOption('fixture-8');
  await expect(
    page.getByRole('button', { name: 'Move picture 1 earlier' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Move picture 2 earlier' }).click();
  await page
    .getByRole('button', { name: 'Remove', exact: true })
    .last()
    .click();
  await page.getByLabel('Show each picture for (seconds)').fill('20');
  await page
    .getByRole('button', { name: 'Preview images', exact: true })
    .click();
  await expect(page.getByText('Picture 1 of 1 · 20 seconds')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(room.writes.at(-1)).toMatchObject({
    method: 'POST',
    path: '/admin/content',
    body: {
      type: 'image_slideshow',
      title: 'Bar prices',
      imageContentIds: ['fixture-8'],
      durationSeconds: 20,
    },
  });
});
