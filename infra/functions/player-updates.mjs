import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export class SoftwareError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
export const terminalSoftwareStates = new Set(['complete', 'failed']);
const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const requestPattern = /^[A-Za-z0-9_-]{1,100}$/;
const states = new Set(['downloading', 'checking', 'restarting', 'complete', 'failed']);

export function authenticatePlayer(device, token) {
  const expected = String(device?.statusTokenHash ?? '');
  const actual = createHash('sha256').update(token).digest('hex');
  if (!token || expected.length !== actual.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
    throw new SoftwareError(401, 'invalid_device_credential');
}

export function publicSoftwareReport(body) {
  if (!body || !requestPattern.test(body.request ?? '') || !states.has(body.status) ||
      (body.activeRelease != null && !releasePattern.test(body.activeRelease)))
    throw new SoftwareError(400, 'invalid_software_report');
  return { request: body.request, status: body.status,
    activeRelease: body.activeRelease ?? null };
}

export function softwareCommand(device, now) {
  const command = device?.softwareUpdate;
  if (!command || command.expiresAt <= now ||
      (device.softwareReport?.request === command.request &&
       terminalSoftwareStates.has(device.softwareReport.status))) return null;
  return { request: command.request, release: command.release,
    bundleUrl: command.bundleUrl };
}

export function createSoftwareRequest({ device, body, releases, baseUrl, actor, now,
                                        requestId = randomUUID() }) {
  if (!device) throw new SoftwareError(404, 'device_not_found');
  if (device.diagnostics?.capabilities?.remote_player_updates !== 1)
    throw new SoftwareError(409, 'This display needs a one-time software installation before it can receive remote updates.');
  const release = releases.find(item => item.release === body.release);
  if (!release) throw new SoftwareError(400, 'unknown_player_release');
  if (release.release === device.diagnostics?.system?.playerVersion)
    throw new SoftwareError(409, 'This software version is already installed.');
  const action = body.action ?? 'update';
  if (!['update', 'rollback'].includes(action)) throw new SoftwareError(400, 'invalid_software_action');
  if (action === 'rollback') {
    if (!release.rollbackOnly || !release.rollbackFrom?.includes(device.diagnostics?.system?.playerVersion))
      throw new SoftwareError(409, 'No approved previous version is available for this display.');
  } else if (release.rollbackOnly) throw new SoftwareError(400, 'Use Restore previous version for this release.');
  if (release.architecture !== device.diagnostics?.hardware?.architecture)
    throw new SoftwareError(409, 'release_not_compatible_with_display');
  if ((body.previousRequest ?? null) !== (device.softwareUpdate?.request ?? null))
    throw new SoftwareError(409, 'software_request_changed_retry');
  if (softwareCommand(device, now))
    throw new SoftwareError(409, 'A software update is already waiting or in progress for this display.');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !releasePattern.test(release.release)) throw new SoftwareError(503, 'release_catalogue_unavailable');
  return { request: requestId, release: release.release, action,
    bundleUrl: `${baseUrl.replace(/\/$/, '')}/player-releases/${release.release}/`,
    requestedAt: now, expiresAt: new Date(Date.parse(now) + 86400000).toISOString(),
    requestedBy: actor.email };
}
