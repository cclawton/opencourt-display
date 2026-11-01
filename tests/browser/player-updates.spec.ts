import { test, expect } from './fixture';

test('older displays explain the one-time installation without an update button', async ({ page, room: _room }) => {
  await page.getByRole('button', { name: 'Bar Room TV information' }).click();
  const panel = page.getByRole('region', { name: 'Display software' });
  await expect(panel).toContainText('one-time installation at the club');
  await expect(panel.getByRole('button', { name: 'Update this display' })).toHaveCount(0);
});

test('administrator updates only the selected display and sees waiting status', async ({ page, room: _room }) => {
  const writes: unknown[] = [];
  await page.route('**/admin/player-releases', route => route.fulfill({ json: { releases: [
    { release: 'player-new', title: 'New player', architecture: 'aarch64' },
  ] } }));
  await page.route('**/admin/devices/honours-board-tv', route => route.fulfill({ json: { device: {
    deviceId: 'honours-board-tv', capabilities: { remote_player_updates: 1 },
    diagnostics: { hardware: { architecture: 'aarch64' }, system: { playerVersion: 'player-old' } },
    softwareUpdate: null, softwareReport: null,
  } } }));
  await page.route('**/admin/devices/honours-board-tv/software', route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: { request: 'req1', release: 'player-new' } });
  });
  await page.getByRole('button', { name: 'Bar Room TV information' }).click();
  const panel = page.getByRole('region', { name: 'Display software' });
  await panel.getByLabel('Software version').selectOption('player-new');
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Bar Room TV');
    await dialog.accept();
  });
  await panel.getByRole('button', { name: 'Update this display' }).click();
  await expect(panel).toContainText('Waiting for this display');
  await expect(panel.getByRole('button', { name: 'Update this display' })).toBeDisabled();
  expect(writes).toEqual([{ release: 'player-new', previousRequest: null }]);
});

test.describe('convenor', () => {
  test.use({ actorRole: 'convenor' });
  test('software controls are absent for convenors', async ({ page, room: _room }) => {
    await page.getByRole('button', { name: 'Bar Room TV information' }).click();
    await expect(page.getByRole('region', { name: 'Display software' })).toHaveCount(0);
  });
});
