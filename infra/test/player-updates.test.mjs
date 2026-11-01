import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createHandler } from '../functions/control-api.mjs';

const device = {
  deviceId: 'bar-prices-tv', revision: 29, schemaVersion: 1,
  source: { type: 'image', url: 'menu.png' },
  statusTokenHash: createHash('sha256').update('device-secret').digest('hex'),
  diagnostics: { capabilities: { remote_player_updates: 1 }, hardware: { architecture: 'aarch64' } },
};
const release = { release: 'player-test1', title: 'Test release', architecture: 'aarch64' };
const event = (path, method = 'GET', body, token = 'admin-token') => ({
  rawPath: path, requestContext: { http: { method } },
  headers: { authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
});
function setup(overrides = {}) {
  const calls = [];
  const dependencies = {
    getDevice: async () => structuredClone(device),
    verifyToken: async token => {
      if (token !== 'admin-token') throw new Error('invalid token');
      return { email: 'admin@example.test', sub: 'admin', role: 'admin' };
    },
    listPlayerReleases: async () => [release], assetPublicBaseUrl: 'https://assets.example',
    requestSoftwareUpdate: async (...args) => calls.push(args),
    reportSoftwareUpdate: async (...args) => calls.push(args),
    now: () => '2026-11-01T08:00:00.000Z', ...overrides,
  };
  return { handler: createHandler(dependencies), calls };
}

test('software request is administrator-only, audited independently of content revision', async () => {
  const { handler, calls } = setup();
  const response = await handler(event('/admin/devices/bar-prices-tv/software', 'POST', { release: release.release, previousRequest: null }));
  assert.equal(response.statusCode, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'bar-prices-tv');
  assert.equal(calls[0][2].release, release.release);
  assert.equal(calls[0][2].bundleUrl, 'https://assets.example/player-releases/player-test1/');
  assert.equal(calls[0][2].revision, undefined);
  assert.equal(device.revision, 29);
  const convenor = setup({ verifyToken: async () => ({ role: 'convenor' }) });
  assert.equal((await convenor.handler(event('/admin/devices/bar-prices-tv/software', 'POST', { release: release.release }))).statusCode, 403);
  assert.equal(convenor.calls.length, 0);
});

test('software updates reject old players, incompatible/unknown releases and stale requests', async () => {
  for (const [current, body, status] of [
    [{ ...device, diagnostics: {} }, { release: release.release }, 409],
    [{ ...device, diagnostics: { ...device.diagnostics, hardware: { architecture: 'armv7l' } } }, { release: release.release }, 409],
    [device, { release: 'https://untrusted.example/malware' }, 400],
    [device, { release: release.release, previousRequest: 'stale' }, 409],
  ]) {
    const { handler, calls } = setup({ getDevice: async () => current });
    assert.equal((await handler(event('/admin/devices/bar-prices-tv/software', 'POST', body))).statusCode, status);
    assert.equal(calls.length, 0);
  }
});

test('device command requires its own credential and never appears in public content', async () => {
  const current = { ...device, softwareUpdate: { request: 'req1', release: release.release,
    bundleUrl: 'https://assets.example/player-releases/player-test1/', expiresAt: '2026-11-02T08:00:00.000Z' } };
  const { handler } = setup({ getDevice: async id => id === device.deviceId ? current : undefined });
  assert.equal((await handler(event('/devices/bar-prices-tv/software'))).statusCode, 401);
  assert.equal((await handler(event('/devices/other-tv/software', 'GET', undefined, 'device-secret'))).statusCode, 401);
  const result = await handler(event('/devices/bar-prices-tv/software', 'GET', undefined, 'device-secret'));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).request.request, 'req1');
  const publicResult = await handler(event('/devices/bar-prices-tv/config'));
  assert.equal(publicResult.statusCode, 200);
  assert.equal(publicResult.body.includes('req1'), false);
  assert.equal(publicResult.body.includes('statusTokenHash'), false);
});

test('terminal and expired commands stop delivery; reports must match current command', async () => {
  const current = { ...device, softwareUpdate: { request: 'req1', release: release.release,
    expiresAt: '2026-11-02T08:00:00.000Z' }, softwareReport: { request: 'req1', status: 'complete' } };
  const { handler, calls } = setup({ getDevice: async () => current });
  const result = await handler(event('/devices/bar-prices-tv/software', 'GET', undefined, 'device-secret'));
  assert.equal(JSON.parse(result.body).request, null);
  assert.equal((await handler(event('/devices/bar-prices-tv/software', 'POST', { request: 'old', status: 'complete' }, 'device-secret'))).statusCode, 409);
  assert.equal((await handler(event('/devices/bar-prices-tv/software', 'POST', { request: 'req1', status: 'shell-execute' }, 'device-secret'))).statusCode, 400);
  assert.equal((await handler(event('/devices/bar-prices-tv/software', 'POST', { request: 'req1', status: 'complete', activeRelease: release.release }, 'device-secret'))).statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].reportedAt, '2026-11-01T08:00:00.000Z');
  const expired = setup({ getDevice: async () => ({ ...current, softwareReport: null,
    softwareUpdate: { ...current.softwareUpdate, expiresAt: '2026-10-31T00:00:00.000Z' } }) });
  assert.equal(JSON.parse((await expired.handler(event('/devices/bar-prices-tv/software', 'GET', undefined, 'device-secret'))).body).request, null);
});
