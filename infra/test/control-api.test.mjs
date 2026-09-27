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

function event(path, headers = {}, method = 'GET', body) {
  return { rawPath: path, headers, body: body === undefined ? undefined : JSON.stringify(body), requestContext: { http: { method } } };
}

function dependencies(overrides = {}) {
  return {
    getDevice: async () => item,
    getProgramme: async () => programme,
    listProgrammes: async () => [programme],
    updateDevice: async () => undefined,
    verifyToken: async (token) => {
      if (token !== 'valid-token') throw new Error('unexpected token');
      return { sub: 'google-subject', email: 'admin@example.test', name: 'Club Admin' };
    },
    now: () => '2026-09-27T01:02:03.000Z',
    ...overrides,
  };
}

test('returns only public device configuration with an ETag', async () => {
  const result = await createHandler(dependencies())(event('/devices/honours-board-tv/config'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.etag, '"honours-board-tv-7"');
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
