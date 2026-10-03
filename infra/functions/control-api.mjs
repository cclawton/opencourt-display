import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';
import { OAuth2Client } from 'google-auth-library';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const googleClient = new OAuth2Client();
const cognitoClient = new CognitoIdentityProviderClient({});
const convenorVerifier = process.env.CONVENOR_USER_POOL_ID
  ? CognitoJwtVerifier.create({
      userPoolId: process.env.CONVENOR_USER_POOL_ID,
      tokenUse: 'id',
      clientId: process.env.CONVENOR_USER_POOL_CLIENT_ID,
    })
  : null;
const DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PROGRAMME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ASSET_ID_PATTERN = /^[a-f0-9-]{36}$/;
const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const IMAGE_MIME_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = 8 * 1024;
const SESSION_DAYS = 90;
const SESSION_PREFIX = 'ocs_';
const MAX_CONVENORS = 5;
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

function sessionHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function publicResponse(statusCode, body, headers = {}) {
  return response(statusCode, body, {
    'cache-control': 'public, max-age=0, must-revalidate',
    ...headers,
  });
}

function decodePathId(rawPath, expression, pattern) {
  const match = rawPath.match(expression);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]);
    return pattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

function deviceIdFromConfigPath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/devices\/([^/]+)\/config$/,
    DEVICE_ID_PATTERN,
  );
}

function deviceIdFromAdminPath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/devices\/([^/]+)$/,
    DEVICE_ID_PATTERN,
  );
}

function deviceIdFromActionPath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/devices\/([^/]+)\/actions$/,
    DEVICE_ID_PATTERN,
  );
}

function deviceIdFromSchedulePath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/devices\/([^/]+)\/schedule$/,
    DEVICE_ID_PATTERN,
  );
}

function deviceIdFromStatusPath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/devices\/([^/]+)\/status$/,
    DEVICE_ID_PATTERN,
  );
}

function assetIdFromCompletePath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/assets\/([^/]+)\/complete$/,
    ASSET_ID_PATTERN,
  );
}

function contentIdFromPath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/content\/([^/]+)$/,
    CONTENT_ID_PATTERN,
  );
}

function contentIdFromCompletePath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/content\/([^/]+)\/complete$/,
    CONTENT_ID_PATTERN,
  );
}

function convenorIdFromPath(rawPath = '') {
  return decodePathId(
    rawPath,
    /^\/admin\/convenors\/([^/]+)$/,
    /^[A-Za-z0-9_-]{8,80}$/,
  );
}

function publicConvenor(item) {
  const attributes = Object.fromEntries(
    (item.Attributes ?? []).map(({ Name, Value }) => [Name, Value]),
  );
  return {
    username: item.Username,
    name: attributes.name,
    phoneNumber: attributes.phone_number,
    enabled: item.Enabled !== false,
  };
}

function validateConvenor(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const phoneNumber =
    typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  if (name.length < 2 || name.length > 80)
    throw new HttpError(400, 'invalid_convenor_name');
  if (!PHONE_PATTERN.test(phoneNumber))
    throw new HttpError(400, 'invalid_phone_number');
  return { name, phoneNumber };
}

function publicConfig(item) {
  return {
    schemaVersion: item.schemaVersion,
    deviceId: item.deviceId,
    revision: item.revision,
    pollIntervalSeconds: item.pollIntervalSeconds,
    source: item.source,
    mode: item.mode ?? 'manual',
    schedule: item.schedule ?? null,
  };
}

const WEEKDAYS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);
const TIME_PATTERN = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;

function timeValue(value) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value))
    throw new HttpError(400, 'invalid_schedule_time');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

async function validateSchedule(body, getContent) {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray(body.entries) ||
    body.entries.length > 100
  )
    throw new HttpError(400, 'invalid_schedule');
  if (
    typeof body.fallbackContentId !== 'string' ||
    !CONTENT_ID_PATTERN.test(body.fallbackContentId)
  )
    throw new HttpError(400, 'invalid_schedule_fallback');
  const ids = new Set([body.fallbackContentId]);
  for (const entry of body.entries) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !WEEKDAYS.has(entry.day) ||
      !CONTENT_ID_PATTERN.test(entry.contentId ?? '')
    )
      throw new HttpError(400, 'invalid_schedule_entry');
    if (timeValue(entry.startTime) >= timeValue(entry.endTime))
      throw new HttpError(400, 'invalid_schedule_window');
    ids.add(entry.contentId);
  }
  const selected = new Map();
  await Promise.all(
    [...ids].map(async (contentId) => {
      const content = await getContent(contentId);
      selected.set(contentId, content);
    }),
  );
  for (const content of selected.values()) validateContent(content);
  const entries = body.entries
    .map((entry) => ({
      day: entry.day,
      startTime: entry.startTime,
      endTime: entry.endTime,
      contentId: entry.contentId,
      name: selected.get(entry.contentId).title,
      source: validateContent(selected.get(entry.contentId)),
    }))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.startTime.localeCompare(b.startTime),
    );
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (previous.day === current.day && previous.endTime > current.startTime)
      throw new HttpError(400, 'overlapping_schedule_entries');
  }
  const fallback = selected.get(body.fallbackContentId);
  return {
    timezone: 'Australia/Melbourne',
    fallback: {
      contentId: fallback.contentId,
      name: fallback.title,
      source: validateContent(fallback),
    },
    entries,
  };
}

function adminDevice(item) {
  return {
    ...publicConfig(item),
    activeSelection: item.activeSelection ?? null,
    override: item.override ?? null,
    updatedAt: item.updatedAt ?? null,
    updatedBy: item.updatedBy ?? null,
    lastConnectedAt: item.lastConnectedAt ?? null,
    diagnostics: item.diagnostics ?? null,
  };
}

function shortText(value, maximum = 160) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= maximum ? text : text.slice(0, maximum);
}

function validateDiagnostics(body) {
  const number = (value, maximum) => {
    const candidate = Number(value);
    return Number.isFinite(candidate) && candidate >= 0
      ? Math.min(candidate, maximum)
      : 0;
  };
  const primaryIp = shortText(body?.network?.primaryIp, 45);
  return {
    hardware: {
      model: shortText(body?.hardware?.model),
      architecture: shortText(body?.hardware?.architecture, 40),
      cpuCount: number(body?.hardware?.cpuCount, 256),
      memoryMiB: number(body?.hardware?.memoryMiB, 1048576),
      storageTotalGiB: number(body?.hardware?.storageTotalGiB, 1048576),
      storageFreeGiB: number(body?.hardware?.storageFreeGiB, 1048576),
    },
    system: {
      hostname: shortText(body?.system?.hostname, 253),
      operatingSystem: shortText(body?.system?.operatingSystem),
      kernel: shortText(body?.system?.kernel, 100),
      uptimeSeconds: number(body?.system?.uptimeSeconds, 315360000),
      playerVersion: shortText(body?.system?.playerVersion, 40),
    },
    network: { primaryIp: isIP(primaryIp) ? primaryIp : '' },
    revision:
      Number.isSafeInteger(body?.revision) && body.revision > 0
        ? body.revision
        : null,
  };
}

function publicProgramme(item) {
  return {
    programmeId: item.programmeId,
    name: item.name,
    shortName: item.shortName,
    day: item.day,
    startTime: item.startTime,
    endTime: item.endTime,
    activities: item.activities,
  };
}

function publicAsset(item) {
  return {
    assetId: item.assetId,
    name: item.name,
    mimeType: item.mimeType,
    byteSize: item.byteSize,
    width: item.width,
    height: item.height,
    publicUrl: item.publicUrl,
    sha256: item.sha256,
    status: item.status,
    createdAt: item.createdAt,
    createdBy: item.createdBy,
  };
}

function publicContent(item) {
  return {
    contentId: item.contentId,
    title: item.title,
    type: item.type,
    provider: item.provider,
    status: item.status,
    source: item.source ?? null,
    mimeType: item.mimeType ?? null,
    byteSize: item.byteSize ?? null,
    width: item.width ?? null,
    height: item.height ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function parseBody(event) {
  if (!event?.body || Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(400, 'invalid_request_body');
  }
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, 'invalid_request_body');
  }
}

function bearerToken(headers = {}) {
  const authorization = headers.authorization ?? headers.Authorization ?? '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match) throw new HttpError(401, 'authentication_required');
  return match[1];
}

function validateSource(source) {
  if (source?.type === 'image') {
    if (
      /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(source.url ?? '') &&
      !source.url.includes('..')
    )
      return source;
    try {
      const url = new URL(source.url);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        ['image/jpeg', 'image/png'].includes(source.mimeType)
      )
        return source;
    } catch {
      // Use a generic error below so stored configuration details are not exposed.
    }
  }
  if (source?.type === 'google_slides') {
    try {
      const url = new URL(source.url);
      if (
        url.protocol === 'https:' &&
        url.hostname === 'docs.google.com' &&
        url.pathname.startsWith('/presentation/d/')
      )
        return source;
    } catch {
      // Use a generic error below so stored configuration details are not exposed.
    }
  }
  throw new HttpError(500, 'invalid_stored_source');
}

function validateUploadRequest(value) {
  const name =
    typeof value.title === 'string'
      ? value.title.trim()
      : typeof value.name === 'string'
        ? value.name.trim()
        : '';
  const mimeType =
    typeof value.mimeType === 'string' ? value.mimeType.toLowerCase() : '';
  const byteSize = Number(value.byteSize);
  const width = Number(value.width);
  const height = Number(value.height);
  const sha256 =
    typeof value.sha256 === 'string' ? value.sha256.toLowerCase() : '';
  if (name.length < 1 || name.length > 120)
    throw new HttpError(400, 'invalid_image_name');
  if (!IMAGE_MIME_TYPES.has(mimeType))
    throw new HttpError(400, 'unsupported_image_type');
  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > MAX_IMAGE_BYTES
  )
    throw new HttpError(400, 'invalid_image_size');
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 7680 ||
    height > 4320
  ) {
    throw new HttpError(400, 'invalid_image_dimensions');
  }
  if (!/^[a-f0-9]{64}$/.test(sha256))
    throw new HttpError(400, 'invalid_image_checksum');
  return { name, mimeType, byteSize, width, height, sha256 };
}

function validateTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title.length < 2 || title.length > 100)
    throw new HttpError(400, 'invalid_content_title');
  return title;
}

function normaliseSlidesSource(value) {
  const rawUrl = typeof value === 'string' ? value.trim() : '';
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, 'invalid_google_slides_url');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'docs.google.com' ||
    parts[0] !== 'presentation' ||
    parts[1] !== 'd'
  ) {
    throw new HttpError(400, 'invalid_google_slides_url');
  }
  if (parts[2] === 'e' && parts[3])
    url.pathname = `/presentation/d/e/${parts[3]}/pub`;
  else if (parts[2]) url.pathname = `/presentation/d/${parts[2]}/preview`;
  else throw new HttpError(400, 'invalid_google_slides_url');
  url.search = '';
  url.searchParams.set('start', 'true');
  url.searchParams.set('loop', 'true');
  url.searchParams.set('delayms', '10000');
  url.searchParams.set('rm', 'minimal');
  return validateSource({ type: 'google_slides', url: url.toString() });
}

function validateContent(item) {
  if (
    !item ||
    item.status !== 'ready' ||
    !['slideshow', 'image'].includes(item.type)
  )
    throw new HttpError(404, 'content_not_found');
  return validateSource(item.source);
}

function imageSource(asset) {
  if (!asset || asset.status !== 'ready')
    throw new HttpError(404, 'image_not_found');
  return validateSource({
    type: 'image',
    url: asset.publicUrl,
    mimeType: asset.mimeType,
    expectedWidth: asset.width,
    expectedHeight: asset.height,
    assetId: asset.assetId,
    sha256: asset.sha256,
  });
}

function eventName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 2 || name.length > 80)
    throw new HttpError(400, 'invalid_event_name');
  return name;
}

function selectProgramme(programme) {
  if (!programme) throw new HttpError(404, 'programme_not_found');
  return validateSource(programme.source);
}

function buildChange(current, action, programme, asset, content, actor, now) {
  if (!current) throw new HttpError(404, 'device_not_found');
  const revision = current.revision + 1;
  let source = current.source;
  let activeSelection = current.activeSelection ?? { kind: 'unknown' };
  let override = null;
  let mode = current.mode ?? 'manual';

  if (action.action === 'show_content') {
    source = validateContent(content);
    activeSelection = {
      kind: 'content',
      contentId: content.contentId,
      contentType: content.type,
      name: content.title,
    };
    mode = 'manual';
  } else if (action.action === 'show_programme') {
    source = selectProgramme(programme);
    activeSelection = {
      kind: 'programme',
      programmeId: programme.programmeId,
      name: programme.name,
    };
  } else if (action.action === 'show_honours') {
    source = validateSource(current.defaultSource);
    activeSelection = { kind: 'honours', name: 'Honours board' };
  } else if (action.action === 'return_to_schedule') {
    if (!current.schedule) throw new HttpError(409, 'schedule_not_configured');
    source = validateSource(current.schedule.fallback.source);
    activeSelection = { kind: 'schedule', name: 'Normal schedule' };
    mode = 'schedule';
  } else if (action.action === 'refresh') {
    source = validateSource(current.source);
  } else if (action.action === 'set_event_override') {
    source = selectProgramme(programme);
    const name = eventName(action.eventName);
    override = { name, programmeId: programme.programmeId, startedAt: now };
    activeSelection = {
      kind: 'event',
      programmeId: programme.programmeId,
      name,
    };
  } else if (action.action === 'show_image') {
    source = imageSource(asset);
    activeSelection = {
      kind: 'image',
      assetId: asset.assetId,
      name: asset.name,
    };
  } else if (action.action === 'set_honours_image') {
    if (asset?.width !== 3840 || asset?.height !== 2160)
      throw new HttpError(400, 'honours_image_must_be_4k');
    source = imageSource(asset);
    activeSelection = {
      kind: 'honours',
      assetId: asset.assetId,
      name: asset.name,
    };
  } else {
    throw new HttpError(400, 'unsupported_action');
  }

  const item = {
    ...current,
    revision,
    source,
    mode,
    activeSelection,
    override,
    updatedAt: now,
    updatedBy: actor.email,
  };
  if (action.action === 'set_honours_image') item.defaultSource = source;
  const audit = {
    deviceId: current.deviceId,
    changedAt: `${now}#${String(revision).padStart(12, '0')}`,
    action: action.action,
    revision,
    actorEmail: actor.email,
    actorSubject: actor.sub,
    activeSelection,
  };
  return { item, audit };
}

export function createHandler({
  getDevice,
  getProgramme,
  listProgrammes,
  getAsset,
  listAssets,
  putAsset,
  completeAsset,
  createUploadUrl,
  headAsset,
  getContent,
  listContent,
  putContent,
  deleteContent,
  listDevices,
  updateDevice,
  verifyToken,
  exchangeSession,
  revokeSession,
  listConvenors = async () => [],
  createConvenor,
  deleteConvenor,
  reportDeviceStatus,
  now = () => new Date().toISOString(),
  newAssetId = randomUUID,
  newContentId = randomUUID,
}) {
  return async function handle(event) {
    try {
      const method = event?.requestContext?.http?.method;
      const rawPath = event?.rawPath ?? '';

      if (rawPath === '/auth/session' && method === 'POST') {
        if (!exchangeSession) throw new HttpError(404, 'not_found');
        const session = await exchangeSession(bearerToken(event?.headers));
        return response(201, session);
      }
      if (rawPath === '/auth/session' && method === 'DELETE') {
        if (!revokeSession) throw new HttpError(404, 'not_found');
        await revokeSession(bearerToken(event?.headers));
        return response(200, { deleted: true });
      }
      if (rawPath === '/auth/convenors' && method === 'GET') {
        const users = await listConvenors();
        return response(200, {
          convenors: users
            .map(publicConvenor)
            .filter((user) => user.enabled && user.username && user.name)
            .map(({ username, name }) => ({ username, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      }

      if (method === 'GET') {
        const publicDeviceId = deviceIdFromConfigPath(rawPath);
        if (publicDeviceId) {
          const item = await getDevice(publicDeviceId);
          if (!item) return publicResponse(404, { error: 'device_not_found' });
          const etag = `"${publicDeviceId}-${item.revision}"`;
          const requestEtag =
            event?.headers?.['if-none-match'] ??
            event?.headers?.['If-None-Match'];
          if (requestEtag === etag)
            return publicResponse(304, undefined, { etag });
          return publicResponse(200, publicConfig(item), { etag });
        }
      }

      const statusDeviceId = deviceIdFromStatusPath(rawPath);
      if (method === 'POST' && statusDeviceId) {
        if (!reportDeviceStatus) throw new HttpError(404, 'not_found');
        await reportDeviceStatus(
          statusDeviceId,
          bearerToken(event?.headers),
          validateDiagnostics(parseBody(event)),
          now(),
        );
        return response(200, { accepted: true });
      }

      if (rawPath === '/auth/me' && method === 'GET') {
        const actor = await verifyToken(bearerToken(event?.headers));
        return response(200, {
          actor: { name: actor.name, email: actor.email, role: actor.role },
        });
      }
      if (!rawPath.startsWith('/admin/'))
        return response(404, { error: 'not_found' });
      const actor = await verifyToken(bearerToken(event?.headers));
      if (actor.role === 'convenor') {
        const allowedRead =
          method === 'GET' &&
          (rawPath === '/admin/content' ||
            Boolean(deviceIdFromAdminPath(rawPath)));
        const allowedAction =
          method === 'POST' && Boolean(deviceIdFromActionPath(rawPath));
        if (!allowedRead && !allowedAction)
          throw new HttpError(403, 'admin_access_required');
      }

      if (method === 'GET' && rawPath === '/admin/convenors') {
        const users = await listConvenors();
        return response(200, {
          convenors: users
            .map(publicConvenor)
            .filter((user) => user.username && user.name && user.phoneNumber)
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      }

      if (method === 'POST' && rawPath === '/admin/convenors') {
        if (!createConvenor) throw new HttpError(404, 'not_found');
        const users = await listConvenors();
        if (users.length >= MAX_CONVENORS)
          throw new HttpError(409, 'convenor_limit_reached');
        const value = validateConvenor(parseBody(event));
        const user = await createConvenor(value);
        return response(201, { convenor: publicConvenor(user) });
      }

      const convenorId = convenorIdFromPath(rawPath);
      if (method === 'DELETE' && convenorId) {
        if (!deleteConvenor) throw new HttpError(404, 'not_found');
        await deleteConvenor(convenorId);
        return response(200, { deleted: true });
      }

      if (method === 'GET' && rawPath === '/admin/programmes') {
        const items = await listProgrammes();
        return response(200, {
          programmes: items
            .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
            .map(publicProgramme),
        });
      }

      if (method === 'GET' && rawPath === '/admin/assets') {
        const items = await listAssets();
        return response(200, {
          assets: items
            .filter((item) => item.status === 'ready')
            .sort((a, b) =>
              String(b.createdAt).localeCompare(String(a.createdAt)),
            )
            .map(publicAsset),
        });
      }

      if (method === 'GET' && rawPath === '/admin/content') {
        const items = await listContent();
        return response(200, {
          content: items
            .filter((item) => item.status === 'ready' || item.source)
            .sort((a, b) => String(a.title).localeCompare(String(b.title)))
            .map(publicContent),
        });
      }

      if (method === 'POST' && rawPath === '/admin/content') {
        const body = parseBody(event);
        if (body.type !== 'slideshow')
          throw new HttpError(400, 'unsupported_content_type');
        const timestamp = now();
        const content = {
          contentId: newContentId(),
          title: validateTitle(body.title),
          type: 'slideshow',
          provider: 'google_slides',
          status: 'ready',
          source: normaliseSlidesSource(body.url),
          createdAt: timestamp,
          createdBy: actor.email,
          updatedAt: timestamp,
          updatedBy: actor.email,
        };
        await putContent(content, true);
        return response(201, { content: publicContent(content) });
      }

      if (method === 'POST' && rawPath === '/admin/content/images/uploads') {
        const body = parseBody(event);
        const upload = validateUploadRequest(body);
        const replacingId =
          typeof body.contentId === 'string' ? body.contentId : '';
        if (replacingId && !CONTENT_ID_PATTERN.test(replacingId))
          throw new HttpError(400, 'invalid_content_id');
        const current = replacingId ? await getContent(replacingId) : undefined;
        if (replacingId && (!current || current.type !== 'image'))
          throw new HttpError(404, 'content_not_found');
        const contentId = current?.contentId ?? newContentId();
        const uploadId = newAssetId();
        const extension = IMAGE_MIME_TYPES.get(upload.mimeType);
        const objectKey = `display-assets/${contentId}/${uploadId}.${extension}`;
        const timestamp = now();
        const pendingUpload = {
          ...upload,
          checksumBase64: Buffer.from(upload.sha256, 'hex').toString('base64'),
          objectKey,
          publicUrl: `${process.env.ASSET_PUBLIC_BASE_URL}/${objectKey}`,
        };
        const content = {
          ...current,
          contentId,
          title: upload.name,
          type: 'image',
          provider: 'uploaded_image',
          status: current?.source ? 'ready' : 'pending',
          pendingUpload,
          createdAt: current?.createdAt ?? timestamp,
          createdBy: current?.createdBy ?? actor.email,
          updatedAt: timestamp,
          updatedBy: actor.email,
        };
        await putContent(content, !current);
        const uploadUrl = await createUploadUrl(pendingUpload);
        return response(201, {
          content: publicContent(content),
          uploadUrl,
          uploadHeaders: {
            'content-type': upload.mimeType,
            'x-amz-checksum-sha256': pendingUpload.checksumBase64,
          },
          expiresInSeconds: 300,
        });
      }

      const completeContentId = contentIdFromCompletePath(rawPath);
      if (method === 'POST' && completeContentId) {
        const content = await getContent(completeContentId);
        if (!content?.pendingUpload)
          return response(404, { error: 'pending_upload_not_found' });
        const stored = await headAsset(content.pendingUpload);
        if (
          stored.byteSize !== content.pendingUpload.byteSize ||
          stored.mimeType !== content.pendingUpload.mimeType ||
          stored.checksumBase64 !== content.pendingUpload.checksumBase64
        ) {
          throw new HttpError(409, 'uploaded_image_does_not_match');
        }
        const upload = content.pendingUpload;
        const readyContent = {
          ...content,
          status: 'ready',
          source: validateSource({
            type: 'image',
            url: upload.publicUrl,
            mimeType: upload.mimeType,
            expectedWidth: upload.width,
            expectedHeight: upload.height,
            sha256: upload.sha256,
          }),
          mimeType: upload.mimeType,
          byteSize: upload.byteSize,
          width: upload.width,
          height: upload.height,
          sha256: upload.sha256,
          objectKey: upload.objectKey,
          verifiedAt: now(),
        };
        delete readyContent.pendingUpload;
        await putContent(readyContent, false);
        return response(200, { content: publicContent(readyContent) });
      }

      const adminContentId = contentIdFromPath(rawPath);
      if (method === 'PUT' && adminContentId) {
        const current = await getContent(adminContentId);
        if (!current) return response(404, { error: 'content_not_found' });
        const body = parseBody(event);
        const updated = {
          ...current,
          title: validateTitle(body.title),
          updatedAt: now(),
          updatedBy: actor.email,
        };
        if (current.type === 'slideshow')
          updated.source = normaliseSlidesSource(body.url);
        await putContent(updated, false);
        return response(200, { content: publicContent(updated) });
      }

      if (method === 'DELETE' && adminContentId) {
        const [current, devices] = await Promise.all([
          getContent(adminContentId),
          listDevices(),
        ]);
        if (!current) return response(404, { error: 'content_not_found' });
        const inUse = devices.some(
          (device) =>
            device.activeSelection?.contentId === adminContentId ||
            device.source?.url === current.source?.url ||
            device.schedule?.fallback?.contentId === adminContentId ||
            device.schedule?.entries?.some(
              (entry) => entry.contentId === adminContentId,
            ),
        );
        if (inUse)
          throw new HttpError(409, 'content_is_currently_on_a_display');
        await deleteContent(adminContentId);
        return response(200, { deleted: true });
      }

      if (method === 'POST' && rawPath === '/admin/assets/uploads') {
        const upload = validateUploadRequest(parseBody(event));
        const assetId = newAssetId();
        const extension = IMAGE_MIME_TYPES.get(upload.mimeType);
        const objectKey = `display-assets/${assetId}.${extension}`;
        const createdAt = now();
        const asset = {
          assetId,
          ...upload,
          checksumBase64: Buffer.from(upload.sha256, 'hex').toString('base64'),
          objectKey,
          publicUrl: `${process.env.ASSET_PUBLIC_BASE_URL}/${objectKey}`,
          status: 'pending',
          createdAt,
          createdBy: actor.email,
        };
        await putAsset(asset);
        const uploadUrl = await createUploadUrl(asset);
        return response(201, {
          asset: publicAsset(asset),
          uploadUrl,
          uploadHeaders: {
            'content-type': asset.mimeType,
            'x-amz-checksum-sha256': asset.checksumBase64,
          },
          expiresInSeconds: 300,
        });
      }

      const completeAssetId = assetIdFromCompletePath(rawPath);
      if (method === 'POST' && completeAssetId) {
        const asset = await getAsset(completeAssetId);
        if (!asset) return response(404, { error: 'image_not_found' });
        if (asset.status === 'ready')
          return response(200, { asset: publicAsset(asset) });
        const stored = await headAsset(asset);
        if (
          stored.byteSize !== asset.byteSize ||
          stored.mimeType !== asset.mimeType ||
          stored.checksumBase64 !== asset.checksumBase64
        ) {
          throw new HttpError(409, 'uploaded_image_does_not_match');
        }
        const readyAsset = { ...asset, status: 'ready', verifiedAt: now() };
        await completeAsset(readyAsset);
        return response(200, { asset: publicAsset(readyAsset) });
      }

      const adminDeviceId = deviceIdFromAdminPath(rawPath);
      if (method === 'GET' && adminDeviceId) {
        const item = await getDevice(adminDeviceId);
        if (!item) return response(404, { error: 'device_not_found' });
        return response(200, {
          device: adminDevice(item),
          actor: { email: actor.email, name: actor.name },
        });
      }

      const scheduleDeviceId = deviceIdFromSchedulePath(rawPath);
      if (method === 'PUT' && scheduleDeviceId) {
        const [current, schedule] = await Promise.all([
          getDevice(scheduleDeviceId),
          validateSchedule(parseBody(event), getContent),
        ]);
        if (!current) throw new HttpError(404, 'device_not_found');
        const timestamp = now();
        const item = {
          ...current,
          revision: current.revision + 1,
          schedule,
          source:
            current.mode === 'schedule'
              ? schedule.fallback.source
              : current.source,
          updatedAt: timestamp,
          updatedBy: actor.email,
        };
        const audit = {
          deviceId: current.deviceId,
          changedAt: `${timestamp}#${String(item.revision).padStart(12, '0')}`,
          action: 'update_schedule',
          revision: item.revision,
          actorEmail: actor.email,
          actorSubject: actor.sub,
          activeSelection: item.activeSelection ?? null,
        };
        await updateDevice({ previousRevision: current.revision, item, audit });
        return response(200, { device: adminDevice(item) });
      }

      const actionDeviceId = deviceIdFromActionPath(rawPath);
      if (method === 'POST' && actionDeviceId) {
        const action = parseBody(event);
        if (
          actor.role === 'convenor' &&
          !['show_content', 'return_to_schedule', 'refresh'].includes(
            action.action,
          )
        )
          throw new HttpError(403, 'admin_access_required');
        const needsContent = action.action === 'show_content';
        const needsProgramme = [
          'show_programme',
          'set_event_override',
        ].includes(action.action);
        const needsAsset = ['show_image', 'set_honours_image'].includes(
          action.action,
        );
        if (
          needsProgramme &&
          !PROGRAMME_ID_PATTERN.test(action.programmeId ?? '')
        )
          throw new HttpError(400, 'invalid_programme_id');
        if (needsAsset && !ASSET_ID_PATTERN.test(action.assetId ?? ''))
          throw new HttpError(400, 'invalid_asset_id');
        if (needsContent && !CONTENT_ID_PATTERN.test(action.contentId ?? ''))
          throw new HttpError(400, 'invalid_content_id');
        const [current, programme, asset, content] = await Promise.all([
          getDevice(actionDeviceId),
          needsProgramme
            ? getProgramme(action.programmeId)
            : Promise.resolve(undefined),
          needsAsset ? getAsset(action.assetId) : Promise.resolve(undefined),
          needsContent
            ? getContent(action.contentId)
            : Promise.resolve(undefined),
        ]);
        const change = buildChange(
          current,
          action,
          programme,
          asset,
          content,
          actor,
          now(),
        );
        await updateDevice({ previousRevision: current.revision, ...change });
        return response(200, { device: adminDevice(change.item) });
      }

      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method))
        return response(
          405,
          { error: 'method_not_allowed' },
          { allow: 'GET, POST, PUT, DELETE' },
        );
      return response(404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof HttpError)
        return response(error.statusCode, { error: error.message });
      if (error?.name === 'TransactionCanceledException')
        return response(409, { error: 'display_changed_retry' });
      console.error('control_api_error', error);
      return response(500, { error: 'internal_error' });
    }
  };
}

async function verifyGoogleToken(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const allowedEmails = new Set(
      (process.env.COMMITTEE_ADMIN_EMAILS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    const requiredDomain = (process.env.GOOGLE_HOSTED_DOMAIN ?? '')
      .trim()
      .toLowerCase();
    if (!payload?.sub || !email || payload.email_verified !== true)
      throw new HttpError(403, 'account_not_authorised');
    if (requiredDomain && payload.hd?.toLowerCase() !== requiredDomain)
      throw new HttpError(403, 'account_not_authorised');
    if (!allowedEmails.has(email))
      throw new HttpError(403, 'account_not_authorised');
    return {
      sub: payload.sub,
      email,
      name: payload.name ?? email,
      role: 'admin',
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'invalid_google_credential');
  }
}

async function verifyConvenorToken(idToken) {
  if (!convenorVerifier)
    throw new HttpError(401, 'invalid_convenor_credential');
  try {
    const payload = await convenorVerifier.verify(idToken);
    const groups = Array.isArray(payload['cognito:groups'])
      ? payload['cognito:groups']
      : [];
    if (!groups.includes(process.env.CONVENOR_GROUP ?? 'convenors'))
      throw new HttpError(403, 'account_not_authorised');
    const name = typeof payload.name === 'string' ? payload.name : 'Convenor';
    return {
      sub: payload.sub,
      email: `convenor:${payload['cognito:username'] ?? payload.sub}`,
      name,
      role: 'convenor',
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'invalid_convenor_credential');
  }
}

async function verifyControlCredential(token) {
  if (!token.startsWith(SESSION_PREFIX)) return verifyGoogleToken(token);
  const result = await documentClient.send(
    new GetCommand({
      TableName: process.env.SESSION_TABLE,
      Key: { sessionHash: sessionHash(token) },
      ConsistentRead: true,
    }),
  );
  const session = result.Item;
  if (!session || session.expiresAt <= Math.floor(Date.now() / 1000))
    throw new HttpError(401, 'session_expired');
  return {
    sub: session.subject,
    email: session.email,
    name: session.name,
    role: session.role ?? 'admin',
  };
}

async function exchangeControlSession(identityCredential) {
  let actor;
  try {
    actor = await verifyGoogleToken(identityCredential);
  } catch (googleError) {
    try {
      actor = await verifyConvenorToken(identityCredential);
    } catch {
      throw googleError;
    }
  }
  const token = `${SESSION_PREFIX}${randomBytes(32).toString('base64url')}`;
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await documentClient.send(
    new PutCommand({
      TableName: process.env.SESSION_TABLE,
      Item: {
        sessionHash: sessionHash(token),
        subject: actor.sub,
        email: actor.email,
        name: actor.name,
        role: actor.role,
        expiresAt,
      },
    }),
  );
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

async function revokeControlSession(token) {
  if (!token.startsWith(SESSION_PREFIX)) return;
  await documentClient.send(
    new DeleteCommand({
      TableName: process.env.SESSION_TABLE,
      Key: { sessionHash: sessionHash(token) },
    }),
  );
}

export const handler = createHandler({
  async getDevice(deviceId) {
    const result = await documentClient.send(
      new GetCommand({
        TableName: process.env.DEVICE_CONFIG_TABLE,
        Key: { deviceId },
        ConsistentRead: false,
      }),
    );
    return result.Item;
  },
  async getProgramme(programmeId) {
    const result = await documentClient.send(
      new GetCommand({
        TableName: process.env.PROGRAMME_TABLE,
        Key: { programmeId },
        ConsistentRead: false,
      }),
    );
    return result.Item;
  },
  async listProgrammes() {
    const result = await documentClient.send(
      new ScanCommand({ TableName: process.env.PROGRAMME_TABLE, Limit: 50 }),
    );
    return result.Items ?? [];
  },
  async getAsset(assetId) {
    const result = await documentClient.send(
      new GetCommand({
        TableName: process.env.ASSET_TABLE,
        Key: { assetId },
        ConsistentRead: false,
      }),
    );
    return result.Item;
  },
  async listAssets() {
    const result = await documentClient.send(
      new ScanCommand({ TableName: process.env.ASSET_TABLE, Limit: 100 }),
    );
    return result.Items ?? [];
  },
  async putAsset(asset) {
    await documentClient.send(
      new PutCommand({
        TableName: process.env.ASSET_TABLE,
        Item: asset,
        ConditionExpression: 'attribute_not_exists(assetId)',
      }),
    );
  },
  async completeAsset(asset) {
    await documentClient.send(
      new PutCommand({
        TableName: process.env.ASSET_TABLE,
        Item: asset,
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pending': 'pending' },
      }),
    );
  },
  async createUploadUrl(asset) {
    return getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: process.env.ASSET_BUCKET,
        Key: asset.objectKey,
        ContentType: asset.mimeType,
        ChecksumSHA256: asset.checksumBase64,
      }),
      {
        expiresIn: 300,
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      },
    );
  },
  async headAsset(asset) {
    const result = await s3Client.send(
      new HeadObjectCommand({
        Bucket: process.env.ASSET_BUCKET,
        Key: asset.objectKey,
        ChecksumMode: 'ENABLED',
      }),
    );
    return {
      byteSize: result.ContentLength,
      mimeType: result.ContentType,
      checksumBase64: result.ChecksumSHA256,
    };
  },
  async getContent(contentId) {
    const result = await documentClient.send(
      new GetCommand({
        TableName: process.env.CONTENT_TABLE,
        Key: { contentId },
        ConsistentRead: false,
      }),
    );
    return result.Item;
  },
  async listContent() {
    const result = await documentClient.send(
      new ScanCommand({ TableName: process.env.CONTENT_TABLE, Limit: 200 }),
    );
    return result.Items ?? [];
  },
  async putContent(content, createOnly) {
    await documentClient.send(
      new PutCommand({
        TableName: process.env.CONTENT_TABLE,
        Item: content,
        ...(createOnly
          ? { ConditionExpression: 'attribute_not_exists(contentId)' }
          : {}),
      }),
    );
  },
  async deleteContent(contentId) {
    await documentClient.send(
      new DeleteCommand({
        TableName: process.env.CONTENT_TABLE,
        Key: { contentId },
      }),
    );
  },
  async listDevices() {
    const result = await documentClient.send(
      new ScanCommand({
        TableName: process.env.DEVICE_CONFIG_TABLE,
        Limit: 100,
      }),
    );
    return result.Items ?? [];
  },
  async reportDeviceStatus(deviceId, token, diagnostics, connectedAt) {
    const current = await documentClient.send(
      new GetCommand({
        TableName: process.env.DEVICE_CONFIG_TABLE,
        Key: { deviceId },
        ConsistentRead: true,
      }),
    );
    const expected = String(current.Item?.statusTokenHash ?? '');
    const actual = sessionHash(token);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    )
      throw new HttpError(401, 'invalid_device_credential');
    await documentClient.send(
      new UpdateCommand({
        TableName: process.env.DEVICE_CONFIG_TABLE,
        Key: { deviceId },
        UpdateExpression:
          'SET lastConnectedAt = :connectedAt, #diagnostics = :diagnostics',
        ConditionExpression: 'statusTokenHash = :tokenHash',
        ExpressionAttributeNames: { '#diagnostics': 'diagnostics' },
        ExpressionAttributeValues: {
          ':connectedAt': connectedAt,
          ':diagnostics': diagnostics,
          ':tokenHash': expected,
        },
      }),
    );
  },
  async updateDevice({ previousRevision, item, audit }) {
    await documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: process.env.DEVICE_CONFIG_TABLE,
              Item: item,
              ConditionExpression: 'revision = :previousRevision',
              ExpressionAttributeValues: {
                ':previousRevision': previousRevision,
              },
            },
          },
          {
            Put: {
              TableName: process.env.AUDIT_TABLE,
              Item: audit,
              ConditionExpression: 'attribute_not_exists(changedAt)',
            },
          },
        ],
      }),
    );
  },
  async listConvenors() {
    const result = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: process.env.CONVENOR_USER_POOL_ID,
        Limit: MAX_CONVENORS + 1,
      }),
    );
    return result.Users ?? [];
  },
  async createConvenor({ name, phoneNumber }) {
    const username = randomUUID();
    const created = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: process.env.CONVENOR_USER_POOL_ID,
        Username: username,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'name', Value: name },
          { Name: 'phone_number', Value: phoneNumber },
          { Name: 'phone_number_verified', Value: 'true' },
        ],
      }),
    );
    try {
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: process.env.CONVENOR_USER_POOL_ID,
          Username: username,
          GroupName: process.env.CONVENOR_GROUP,
        }),
      );
    } catch (error) {
      await cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: process.env.CONVENOR_USER_POOL_ID,
          Username: username,
        }),
      );
      throw error;
    }
    return created.User;
  },
  async deleteConvenor(username) {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: process.env.CONVENOR_USER_POOL_ID,
        Username: username,
      }),
    );
  },
  verifyToken: verifyControlCredential,
  exchangeSession: exchangeControlSession,
  revokeSession: revokeControlSession,
});
