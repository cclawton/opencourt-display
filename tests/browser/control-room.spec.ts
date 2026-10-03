import { test, expect, titles } from './fixture';

test.describe('convenor navigation', () => {
  test.use({ actorRole: 'convenor' });

  test('provides Displays and Schedule but hides admin-only sections', async ({
    page,
    room,
  }) => {
    const navigation = page.getByLabel('Control room sections');
    await expect(
      navigation.getByRole('button', { name: 'Displays', exact: true }),
    ).toBeVisible();
    await expect(
      navigation.getByRole('button', { name: 'Schedule', exact: true }),
    ).toBeVisible();
    await expect(
      navigation.getByRole('button', { name: 'Content', exact: true }),
    ).toHaveCount(0);
    await expect(
      navigation.getByRole('button', { name: 'Users', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Choose what to show')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Refresh TV' }),
    ).toBeVisible();
    await navigation
      .getByRole('button', { name: 'Schedule', exact: true })
      .click();
    await page.getByRole('button', { name: 'Add time' }).click();
    await page.getByRole('button', { name: 'Save schedule' }).click();
    await expect(page.getByRole('status')).toContainText('Schedule saved.');
    expect(room.writes.at(-1)).toMatchObject({
      method: 'PUT',
      path: '/admin/devices/honours-board-tv/schedule',
    });
    await navigation
      .getByRole('button', { name: 'Displays', exact: true })
      .click();
    await expect(page.getByLabel('Choose what to show')).toBeVisible();
  });
});

test('nine seeded-shape items, current selection and responsive layout', async ({
  page,
  room,
}) => {
  await expect(page.locator('optgroup[label="Slideshows"] option')).toHaveText(
    titles.slice(0, 8),
  );
  await expect(
    page.locator('optgroup[label="Still images"] option'),
  ).toHaveText(['Honours Board']);
  await expect(page.getByText('Currently showing:')).toContainText(
    'Honours Board',
  );
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(9);
  const honours = page.locator('article').filter({ hasText: 'Honours Board' });
  await expect(honours).toContainText('3840×2160');
  await expect(honours.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(room.writes).toEqual([]);
});

test('TV information shows connection, network and hardware diagnostics', async ({
  page,
  room: _room,
}) => {
  await page.getByRole('button', { name: 'Bar Room TV information' }).click();
  await expect(page.getByText('192.168.1.42')).toBeVisible();
  await expect(page.getByText('Raspberry Pi 5 Model B')).toBeVisible();
  await expect(page.getByText('Raspberry Pi OS')).toBeVisible();
  await expect(page.getByText('opencourt-honours')).toBeVisible();
});

test('shows both TVs and opens Kitchen TV diagnostics', async ({
  page,
  room: _room,
}) => {
  await expect(
    page.getByRole('button', { name: /Bar Room TV Last connected/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Kitchen TV Last connected/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Kitchen TV Last connected/ }).click();
  await page.getByRole('button', { name: 'Kitchen TV information' }).click();
  await expect(page.getByText('opencourt-kitchen')).toBeVisible();
  await expect(page.getByText('Raspberry Pi 400 Rev 1.1')).toBeVisible();
  await expect(page.getByText('192.168.4.87')).toBeVisible();
});

test('show every item and refresh without changing selection', async ({
  page,
  room,
}) => {
  for (let i = 0; i < titles.length; i++) {
    await page.getByLabel('Choose what to show').selectOption(`fixture-${i}`);
    await page.getByRole('button', { name: 'Show on TV' }).click();
    await expect(page.getByRole('status')).toContainText('TV updated.');
    await expect(page.getByText('Currently showing:')).toContainText(titles[i]);
    await expect(
      page.getByRole('button', { name: 'Show on TV' }),
    ).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Refresh TV' }).click();
  await expect(page.getByRole('status')).toContainText('TV refresh requested.');
  await expect(page.getByText('Currently showing:')).toContainText(
    'Honours Board',
  );
  expect(room.writes.map((w) => w.body)).toEqual([
    ...titles.map((_, i) => ({
      action: 'show_content',
      contentId: `fixture-${i}`,
    })),
    { action: 'refresh' },
  ]);
  await expect(
    page.getByText(
      'Updated a Google Slides presentation? Use Refresh TV to show the latest changes.',
    ),
  ).toBeVisible();
});

test('create, edit, cancel deletion and delete unused slideshow', async ({
  page,
  room,
}) => {
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Add public Google Slides presentation',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Share a Google Slides presentation publicly'),
  ).toBeVisible();
  await expect(page.getByText('Select Copy link, then Done.')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('UX test slideshow');
  await page
    .getByLabel('Google Slides URL')
    .fill('https://docs.google.com/presentation/d/fixture-new/pub');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.locator('article').filter({ hasText: 'UX test slideshow' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit' }).click();
  await page
    .getByLabel('Title', { exact: true })
    .fill('UX test slideshow renamed');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row).toContainText('renamed');
  page.once('dialog', (d) => d.dismiss());
  await row.getByRole('button', { name: 'Delete' }).click();
  expect(room.writes).toHaveLength(2);
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0);
  expect(room.writes.map((w) => w.method)).toEqual(['POST', 'PUT', 'DELETE']);
});

test('validation failure preserves editor and allows retry', async ({
  page,
  room,
}) => {
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Add public Google Slides presentation',
      exact: true,
    })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Invalid example');
  await page.getByLabel('Google Slides URL').fill('https://example.com');
  room.fail('invalid_google_slides_url');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Paste a valid Google Slides sharing or published URL.',
  );
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Invalid example',
  );
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Google Slides URL')).toHaveCount(0);
});

test('missing image gives actionable feedback without upload', async ({
  page,
  room,
}) => {
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: 'Add image', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Choose a JPEG or PNG image.',
  );
  expect(room.writes).toEqual([]);
});

test('conflicting TV change reports error without false success', async ({
  page,
  room,
}) => {
  room.fail('display_changed_retry');
  await page.getByRole('button', { name: 'Show on TV' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Someone else changed the TV at the same time. Please try again.',
  );
  await expect(page.getByRole('button', { name: 'Show on TV' })).toBeEnabled();
});

test('saves weekly scheduling then enables it from the display dropdown', async ({
  page,
  room,
}) => {
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await page.getByRole('button', { name: 'Add time' }).click();
  await page.getByLabel('Schedule day 1').selectOption('Monday');
  await page.getByLabel('Schedule start 1').fill('17:10');
  await page.getByLabel('Schedule end 1').fill('23:59');
  await page.getByLabel('Schedule content 1').selectOption('fixture-2');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByRole('status')).toContainText('Schedule saved.');
  await page.clock.setFixedTime(new Date('2026-10-05T07:00:00.000Z'));
  await page.getByRole('button', { name: 'Displays', exact: true }).click();
  await page.getByLabel('Choose what to show').selectOption('__schedule__');
  await page.getByRole('button', { name: 'Show on TV' }).click();
  await expect(page.getByRole('status')).toContainText(
    'returned to its schedule',
  );
  await expect(page.getByText('Currently showing:')).toContainText(
    'Monday Night (Schedule)',
  );
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await expect(
    page
      .locator('article')
      .filter({ hasText: 'Monday Night' })
      .getByText('On Bar Room TV'),
  ).toBeVisible();
  expect(room.writes.map((write) => write.body)).toEqual([
    {
      fallbackContentId: 'fixture-8',
      entries: [
        {
          day: 'Monday',
          startTime: '17:10',
          endTime: '23:59',
          contentId: 'fixture-2',
        },
      ],
    },
    { action: 'return_to_schedule' },
  ]);
});

test('session survives reload and sign out removes committee access', async ({
  page,
  room,
}) => {
  await page.reload();
  await expect(page.getByLabel('Control room sections')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Bar Room TV Last connected/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Control room sections')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Test committee sign in' }),
  ).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'ocs_fixture-session',
  );
  await page.reload();
  await expect(page.getByLabel('Control room sections')).toHaveCount(0);
  expect(room.writes).toEqual([]);
});

test('add and replace image use verified upload lifecycle', async ({
  page,
  room,
}) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const image = {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: 'Add image', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Test image');
  await page.getByLabel('Image file', { exact: true }).setInputFiles(image);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Image added.');
  const row = page.locator('article').filter({ hasText: 'Test image' });
  await expect(row).toContainText('Still image · 1×1');
  await row.getByLabel('Replace').setInputFiles(image);
  await expect(page.getByRole('status')).toHaveText('Test image replaced.');
  expect(room.writes.map((w) => w.path)).toEqual([
    '/admin/content/images/uploads',
    '/admin/content/fixture-upload/complete',
    '/admin/content/images/uploads',
    '/admin/content/fixture-upload/complete',
  ]);
  expect(room.writes[0].body).toMatchObject({
    title: 'Test image',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: image.buffer.length,
  });
  expect(room.writes[0].body?.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(room.writes[2].body?.contentId).toBe('fixture-upload');
});
