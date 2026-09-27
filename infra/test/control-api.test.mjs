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
  updatedAt: 'not-public',
  updatedBy: 'not-public',
};

function event(path, headers = {}, method = 'GET') {
  return {
    rawPath: path,
    headers,
    requestContext: { http: { method } },
  };
}

test('returns only public device configuration with an ETag', async () => {
  const handler = createHandler({ getDevice: async () => item });
  const result = await handler(event('/devices/honours-board-tv/config'));

  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.etag, '"honours-board-tv-7"');
  assert.deepEqual(JSON.parse(result.body), {
    schemaVersion: 1,
    deviceId: 'honours-board-tv',
    revision: 7,
    pollIntervalSeconds: 60,
    source: { type: 'image', url: 'honours-board.jpg' },
  });
});

test('returns 304 when the device already has the revision', async () => {
  const handler = createHandler({ getDevice: async () => item });
  const result = await handler(
    event('/devices/honours-board-tv/config', { 'if-none-match': '"honours-board-tv-7"' }),
  );

  assert.equal(result.statusCode, 304);
  assert.equal(result.body, undefined);
});

test('does not expose unknown devices or unsupported methods', async () => {
  const handler = createHandler({ getDevice: async () => undefined });

  assert.equal((await handler(event('/devices/unknown-tv/config'))).statusCode, 404);
  assert.equal((await handler(event('/devices/%E0%A4%A/config'))).statusCode, 404);
  assert.equal((await handler(event('/devices/honours-board-tv/config', {}, 'PUT'))).statusCode, 405);
  assert.equal((await handler(event('/admin/devices/honours-board-tv/config'))).statusCode, 404);
});

test('seed validation accepts safe providers and rejects unsafe input', () => {
  assert.equal(
    validateDeviceConfig({
      schemaVersion: 1,
      deviceId: 'honours-board-tv',
      revision: 1,
      pollIntervalSeconds: 60,
      source: { type: 'image', url: 'honours-board.jpg' },
    }).deviceId,
    'honours-board-tv',
  );

  assert.throws(
    () =>
      validateDeviceConfig({
        schemaVersion: 1,
        deviceId: 'honours-board-tv',
        revision: 1,
        pollIntervalSeconds: 60,
        source: { type: 'image', url: '../private.jpg' },
      }),
    /local filename/,
  );
  assert.throws(
    () =>
      validateDeviceConfig({
        schemaVersion: 1,
        deviceId: 'honours-board-tv',
        revision: 1,
        pollIntervalSeconds: 60,
        source: { type: 'google_slides', url: 'https://example.com/slides' },
      }),
    /Google Slides URL/,
  );
});
