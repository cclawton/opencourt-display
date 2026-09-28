import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../functions/control-api.mjs';
import { validateDeviceConfig } from '../scripts/put-device-config.mjs';

const item = {
  schemaVersion: 1,
  deviceId: 'honours-board-tv',
  revision: 7,
  pollIntervalSeconds: 60,
  source: { type: 'image', url: 'honours-board.jpg' },
  defaultSource: { type: 'image', url: 'honours-board.jpg' },
  activeSelection: { kind: 'honours', name: 'Honours board' },
  updatedAt: '2026-09-27T00:00:00.000Z',
  updatedBy: 'admin@example.test',
};

const programme = {
  programmeId: 'sat-am',
  name: 'Saturday Morning',
  shortName: 'Sat AM',
  day: 'Saturday',
  startTime: '07:00',
  endTime: '12:30',
  activities: ['Juniors'],
  source: { type: 'google_slides', url: 'https://docs.google.com/presentation/d/e/example/pub?start=true', title: 'Saturday Morning court allocations' },
  sortOrder: 1,
};

const asset = {
  assetId: '11111111-1111-4111-8111-111111111111',
  name: '2026 honours board',
  mimeType: 'image/png',
  byteSize: 12345,
  width: 3840,
  height: 2160,
  objectKey: 'display-assets/11111111-1111-4111-8111-111111111111.png',
  publicUrl: 'https://display.example/display-assets/11111111-1111-4111-8111-111111111111.png',
  sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  checksumBase64: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
  status: 'ready',
  createdAt: '2026-09-27T01:00:00.000Z',
  createdBy: 'admin@example.test',
};

const content = {
  contentId: 'sat-am',
  title: 'Saturday Morning',
  type: 'slideshow',
  provider: 'google_slides',
  status: 'ready',
  source: programme.source,
  createdAt: '2026-09-27T01:00:00.000Z',
  createdBy: 'admin@example.test',
  updatedAt: '2026-09-27T01:00:00.000Z',
  updatedBy: 'admin@example.test',
};

function event(path, headers = {}, method = 'GET', body) {
  return { rawPath: path, headers, body: body === undefined ? undefined : JSON.stringify(body), requestContext: { http: { method } } };
}

function dependencies(overrides = {}) {
  return {
    getDevice: async () => item,
    getProgramme: async () => programme,
    listProgrammes: async () => [programme],
    getAsset: async () => asset,
    listAssets: async () => [asset],
    putAsset: async () => undefined,
    completeAsset: async () => undefined,
    createUploadUrl: async () => 'https://uploads.example/signed',
    headAsset: async (value) => ({ byteSize: value.byteSize, mimeType: value.mimeType, checksumBase64: value.checksumBase64 }),
    getContent: async () => content,
    listContent: async () => [content],
    putContent: async () => undefined,
    deleteContent: async () => undefined,
    listDevices: async () => [item],
    updateDevice: async () => undefined,
    verifyToken: async (token) => {
      if (token !== 'valid-token') throw new Error('unexpected token');
      return { sub: 'google-subject', email: 'admin@example.test', name: 'Club Admin' };
    },
    now: () => '2026-09-27T01:02:03.000Z',
    newContentId: () => 'new-slideshow',
    ...overrides,
  };
}

test('returns only public device configuration with an ETag', async () => {
  const result = await createHandler(dependencies())(event('/devices/honours-board-tv/config'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.etag, '"honours-board-tv-7"');
  assert.equal(result.headers['access-control-allow-origin'], undefined);
  assert.deepEqual(JSON.parse(result.body), { schemaVersion: 1, deviceId: 'honours-board-tv', revision: 7, pollIntervalSeconds: 60, source: item.source });
});

test('returns 304 when the device already has the revision', async () => {
  const result = await createHandler(dependencies())(event('/devices/honours-board-tv/config', { 'if-none-match': '"honours-board-tv-7"' }));
  assert.equal(result.statusCode, 304);
  assert.equal(result.body, undefined);
});

test('requires a bearer credential for every admin route', async () => {
  const handler = createHandler(dependencies());
  assert.equal((await handler(event('/admin/programmes'))).statusCode, 401);
  assert.equal((await handler(event('/admin/devices/honours-board-tv'))).statusCode, 401);
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', {}, 'POST', { action: 'refresh' }))).statusCode, 401);
  assert.equal((await handler(event('/admin/content'))).statusCode, 401);
});

test('lists, creates and edits generic content', async () => {
  const writes = [];
  const handler = createHandler(dependencies({ putContent: async (...args) => writes.push(args) }));
  const headers = { authorization: 'Bearer valid-token' };
  const listResult = await handler(event('/admin/content', headers));
  assert.equal(listResult.statusCode, 200);
  assert.equal(JSON.parse(listResult.body).content[0].title, 'Saturday Morning');

  const createResult = await handler(event('/admin/content', headers, 'POST', {
    type: 'slideshow',
    title: 'Friday Social',
    url: 'https://docs.google.com/presentation/d/example/edit',
  }));
  assert.equal(createResult.statusCode, 201);
  assert.equal(writes[0][0].source.url, 'https://docs.google.com/presentation/d/example/preview?start=true&loop=true&delayms=10000&rm=minimal');
  assert.equal(writes[0][1], true);

  const editResult = await handler(event('/admin/content/sat-am', headers, 'PUT', {
    title: 'Saturday Juniors',
    url: 'https://docs.google.com/presentation/d/e/published/pub',
  }));
  assert.equal(editResult.statusCode, 200);
  assert.equal(writes[1][0].title, 'Saturday Juniors');
  assert.equal(writes[1][1], false);
});

test('creates and completes a generic image upload, including replacement', async () => {
  process.env.ASSET_PUBLIC_BASE_URL = 'https://display.example';
  let storedContent;
  const imageContent = {
    contentId: 'honours-board', title: 'Honours Board', type: 'image', provider: 'local_image', status: 'ready',
    source: { type: 'image', url: 'honours-board.jpg' }, createdAt: asset.createdAt, createdBy: asset.createdBy,
  };
  const handler = createHandler(dependencies({
    getContent: async () => storedContent ?? imageContent,
    putContent: async (value) => { storedContent = value; },
    newAssetId: () => '33333333-3333-4333-8333-333333333333',
  }));
  const headers = { authorization: 'Bearer valid-token' };
  const createResult = await handler(event('/admin/content/images/uploads', headers, 'POST', {
    contentId: 'honours-board', title: 'Honours Board', mimeType: 'image/png', byteSize: 12345, width: 3840, height: 2160,
    sha256: asset.sha256,
  }));
  assert.equal(createResult.statusCode, 201);
  assert.equal(storedContent.source.url, 'honours-board.jpg');
  assert.ok(storedContent.pendingUpload.objectKey.includes('/33333333-3333-4333-8333-333333333333.png'));

  const completeResult = await handler(event('/admin/content/honours-board/complete', headers, 'POST', {}));
  assert.equal(completeResult.statusCode, 200);
  assert.equal(storedContent.source.url, 'https://display.example/display-assets/honours-board/33333333-3333-4333-8333-333333333333.png');
  assert.equal(storedContent.pendingUpload, undefined);
});

test('deletes unused content and protects the currently displayed item', async () => {
  let deleted;
  const headers = { authorization: 'Bearer valid-token' };
  const freeHandler = createHandler(dependencies({ listDevices: async () => [], deleteContent: async (id) => { deleted = id; } }));
  assert.equal((await freeHandler(event('/admin/content/sat-am', headers, 'DELETE'))).statusCode, 200);
  assert.equal(deleted, 'sat-am');

  const activeHandler = createHandler(dependencies({ listDevices: async () => [{ ...item, source: content.source }] }));
  const activeResult = await activeHandler(event('/admin/content/sat-am', headers, 'DELETE'));
  assert.equal(activeResult.statusCode, 409);
  assert.equal(JSON.parse(activeResult.body).error, 'content_is_currently_on_a_display');
});

test('returns authenticated programme and device status', async () => {
  const handler = createHandler(dependencies());
  const headers = { authorization: 'Bearer valid-token' };
  const programmesResult = await handler(event('/admin/programmes', headers));
  const deviceResult = await handler(event('/admin/devices/honours-board-tv', headers));
  assert.equal(programmesResult.statusCode, 200);
  assert.deepEqual(JSON.parse(programmesResult.body).programmes[0], { programmeId: 'sat-am', name: 'Saturday Morning', shortName: 'Sat AM', day: 'Saturday', startTime: '07:00', endTime: '12:30', activities: ['Juniors'] });
  assert.equal(JSON.parse(deviceResult.body).actor.email, 'admin@example.test');
});

test('creates, verifies and lists authenticated image uploads', async () => {
  process.env.ASSET_PUBLIC_BASE_URL = 'https://display.example';
  let pending;
  let completed;
  const handler = createHandler(dependencies({
    getAsset: async () => pending,
    listAssets: async () => [asset, { ...asset, assetId: '22222222-2222-4222-8222-222222222222', status: 'pending' }],
    putAsset: async (value) => { pending = value; },
    completeAsset: async (value) => { completed = value; pending = value; },
    newAssetId: () => '33333333-3333-4333-8333-333333333333',
  }));
  const headers = { authorization: 'Bearer valid-token' };

  const createResult = await handler(event('/admin/assets/uploads', headers, 'POST', {
    name: 'Corrected honours board.png', mimeType: 'image/png', byteSize: 12345, width: 3840, height: 2160,
    sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  }));
  assert.equal(createResult.statusCode, 201);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.createdBy, 'admin@example.test');
  assert.equal(JSON.parse(createResult.body).uploadUrl, 'https://uploads.example/signed');

  const completeResult = await handler(event('/admin/assets/33333333-3333-4333-8333-333333333333/complete', headers, 'POST', {}));
  assert.equal(completeResult.statusCode, 200);
  assert.equal(completed.status, 'ready');

  const listResult = await handler(event('/admin/assets', headers));
  assert.equal(listResult.statusCode, 200);
  assert.equal(JSON.parse(listResult.body).assets.length, 1);
});

test('rejects unsafe image upload metadata and mismatched stored objects', async () => {
  const headers = { authorization: 'Bearer valid-token' };
  const handler = createHandler(dependencies({
    getAsset: async () => ({ ...asset, status: 'pending' }),
    headAsset: async () => ({ byteSize: 999, mimeType: 'image/png', checksumBase64: asset.checksumBase64 }),
  }));
  assert.equal((await handler(event('/admin/assets/uploads', headers, 'POST', { name: 'x', mimeType: 'image/svg+xml', byteSize: 2, width: 10, height: 10, sha256: asset.sha256 }))).statusCode, 400);
  assert.equal((await handler(event('/admin/assets/uploads', headers, 'POST', { name: 'x', mimeType: 'image/png', byteSize: 30_000_000, width: 3840, height: 2160, sha256: asset.sha256 }))).statusCode, 400);
  assert.equal((await handler(event('/admin/assets/11111111-1111-4111-8111-111111111111/complete', headers, 'POST', {}))).statusCode, 409);
});

test('show programme increments revision and records an audit event', async () => {
  let update;
  const handler = createHandler(dependencies({ updateDevice: async (value) => { update = value; } }));
  const result = await handler(event('/admin/devices/honours-board-tv/actions', { authorization: 'Bearer valid-token' }, 'POST', { action: 'show_programme', programmeId: 'sat-am' }));
  assert.equal(result.statusCode, 200);
  assert.equal(update.previousRevision, 7);
  assert.equal(update.item.revision, 8);
  assert.equal(update.item.source.type, 'google_slides');
  assert.deepEqual(update.item.activeSelection, { kind: 'programme', programmeId: 'sat-am', name: 'Saturday Morning' });
  assert.equal(update.audit.actorEmail, 'admin@example.test');
});

test('show content selects any ready content item', async () => {
  let update;
  const handler = createHandler(dependencies({ updateDevice: async (value) => { update = value; } }));
  const result = await handler(event('/admin/devices/honours-board-tv/actions', { authorization: 'Bearer valid-token' }, 'POST', { action: 'show_content', contentId: 'sat-am' }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(update.item.activeSelection, { kind: 'content', contentId: 'sat-am', contentType: 'slideshow', name: 'Saturday Morning' });
  assert.equal(update.item.source.type, 'google_slides');
});

test('refresh, event override and return-to-schedule produce safe revisions', async () => {
  const updates = [];
  const handler = createHandler(dependencies({ updateDevice: async (value) => updates.push(value) }));
  const headers = { authorization: 'Bearer valid-token' };
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', headers, 'POST', { action: 'refresh' }))).statusCode, 200);
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', headers, 'POST', { action: 'set_event_override', programmeId: 'sat-am', eventName: 'Club Championships' }))).statusCode, 200);
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', headers, 'POST', { action: 'return_to_schedule' }))).statusCode, 200);
  assert.deepEqual(updates[0].item.source, item.source);
  assert.equal(updates[1].item.override.name, 'Club Championships');
  assert.equal(updates[2].item.source.type, 'image');
  assert.equal(updates[2].item.override, null);
});

test('shows arbitrary images and makes only exact 4K images the honours default', async () => {
  const updates = [];
  const handler = createHandler(dependencies({ updateDevice: async (value) => updates.push(value) }));
  const headers = { authorization: 'Bearer valid-token' };
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', headers, 'POST', { action: 'show_image', assetId: asset.assetId }))).statusCode, 200);
  assert.equal(updates[0].item.source.url, asset.publicUrl);
  assert.equal(updates[0].item.defaultSource.url, 'honours-board.jpg');
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', headers, 'POST', { action: 'set_honours_image', assetId: asset.assetId }))).statusCode, 200);
  assert.equal(updates[1].item.defaultSource.url, asset.publicUrl);
  assert.equal(updates[1].item.defaultSource.expectedWidth, 3840);
  assert.equal(updates[1].item.defaultSource.expectedHeight, 2160);
});

test('rejects unsupported methods, malformed bodies and unknown routes', async () => {
  const handler = createHandler(dependencies());
  const headers = { authorization: 'Bearer valid-token' };
  assert.equal((await handler(event('/devices/honours-board-tv/config', {}, 'PUT'))).statusCode, 404);
  assert.equal((await handler(event('/admin/devices/honours-board-tv/actions', headers, 'POST', { action: 'unknown' }))).statusCode, 400);
  assert.equal((await handler({ ...event('/admin/devices/honours-board-tv/actions', headers, 'POST'), body: '{' })).statusCode, 400);
  assert.equal((await handler(event('/admin/missing', headers))).statusCode, 404);
});

test('seed validation accepts safe providers and rejects unsafe input', () => {
  assert.equal(validateDeviceConfig({ schemaVersion: 1, deviceId: 'honours-board-tv', revision: 1, pollIntervalSeconds: 60, source: { type: 'image', url: 'honours-board.jpg' } }).deviceId, 'honours-board-tv');
  assert.throws(() => validateDeviceConfig({ schemaVersion: 1, deviceId: 'honours-board-tv', revision: 1, pollIntervalSeconds: 60, source: { type: 'image', url: '../private.jpg' } }), /local filename/);
  assert.throws(() => validateDeviceConfig({ schemaVersion: 1, deviceId: 'honours-board-tv', revision: 1, pollIntervalSeconds: 60, source: { type: 'google_slides', url: 'https://example.com/slides' } }), /Google Slides URL/);
});
