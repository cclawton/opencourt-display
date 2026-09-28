import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const googleClient = new OAuth2Client();
const DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PROGRAMME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ASSET_ID_PATTERN = /^[a-f0-9-]{36}$/;
const IMAGE_MIME_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png']]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = 8 * 1024;

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
  return decodePathId(rawPath, /^\/devices\/([^/]+)\/config$/, DEVICE_ID_PATTERN);
}

function deviceIdFromAdminPath(rawPath = '') {
  return decodePathId(rawPath, /^\/admin\/devices\/([^/]+)$/, DEVICE_ID_PATTERN);
}

function deviceIdFromActionPath(rawPath = '') {
  return decodePathId(rawPath, /^\/admin\/devices\/([^/]+)\/actions$/, DEVICE_ID_PATTERN);
}

function assetIdFromCompletePath(rawPath = '') {
  return decodePathId(rawPath, /^\/admin\/assets\/([^/]+)\/complete$/, ASSET_ID_PATTERN);
}

function publicConfig(item) {
  return {
    schemaVersion: item.schemaVersion,
    deviceId: item.deviceId,
    revision: item.revision,
    pollIntervalSeconds: item.pollIntervalSeconds,
    source: item.source,
  };
}

function adminDevice(item) {
  return {
    ...publicConfig(item),
    activeSelection: item.activeSelection ?? null,
    override: item.override ?? null,
    updatedAt: item.updatedAt ?? null,
    updatedBy: item.updatedBy ?? null,
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

function parseBody(event) {
  if (!event?.body || Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(400, 'invalid_request_body');
  }
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
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
    if (/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(source.url ?? '') && !source.url.includes('..')) return source;
    try {
      const url = new URL(source.url);
      if (url.protocol === 'https:' && !url.username && !url.password && ['image/jpeg', 'image/png'].includes(source.mimeType)) return source;
    } catch {
      // Use a generic error below so stored configuration details are not exposed.
    }
  }
  if (source?.type === 'google_slides') {
    try {
      const url = new URL(source.url);
      if (url.protocol === 'https:' && url.hostname === 'docs.google.com' && url.pathname.startsWith('/presentation/d/')) return source;
    } catch {
      // Use a generic error below so stored configuration details are not exposed.
    }
  }
  throw new HttpError(500, 'invalid_stored_source');
}

function validateUploadRequest(value) {
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType.toLowerCase() : '';
  const byteSize = Number(value.byteSize);
  const width = Number(value.width);
  const height = Number(value.height);
  const sha256 = typeof value.sha256 === 'string' ? value.sha256.toLowerCase() : '';
  if (name.length < 1 || name.length > 120) throw new HttpError(400, 'invalid_image_name');
  if (!IMAGE_MIME_TYPES.has(mimeType)) throw new HttpError(400, 'unsupported_image_type');
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_IMAGE_BYTES) throw new HttpError(400, 'invalid_image_size');
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 7680 || height > 4320) {
    throw new HttpError(400, 'invalid_image_dimensions');
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new HttpError(400, 'invalid_image_checksum');
  return { name, mimeType, byteSize, width, height, sha256 };
}

function imageSource(asset) {
  if (!asset || asset.status !== 'ready') throw new HttpError(404, 'image_not_found');
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
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'invalid_event_name');
  return name;
}

function selectProgramme(programme) {
  if (!programme) throw new HttpError(404, 'programme_not_found');
  return validateSource(programme.source);
}

function buildChange(current, action, programme, asset, actor, now) {
  if (!current) throw new HttpError(404, 'device_not_found');
  const revision = current.revision + 1;
  let source = current.source;
  let activeSelection = current.activeSelection ?? { kind: 'unknown' };
  let override = null;

  if (action.action === 'show_programme') {
    source = selectProgramme(programme);
    activeSelection = { kind: 'programme', programmeId: programme.programmeId, name: programme.name };
  } else if (action.action === 'show_honours') {
    source = validateSource(current.defaultSource);
    activeSelection = { kind: 'honours', name: 'Honours board' };
  } else if (action.action === 'return_to_schedule') {
    source = validateSource(current.defaultSource);
    activeSelection = { kind: 'schedule', name: 'Normal schedule' };
  } else if (action.action === 'refresh') {
    source = validateSource(current.source);
  } else if (action.action === 'set_event_override') {
    source = selectProgramme(programme);
    const name = eventName(action.eventName);
    override = { name, programmeId: programme.programmeId, startedAt: now };
    activeSelection = { kind: 'event', programmeId: programme.programmeId, name };
  } else if (action.action === 'show_image') {
    source = imageSource(asset);
    activeSelection = { kind: 'image', assetId: asset.assetId, name: asset.name };
  } else if (action.action === 'set_honours_image') {
    if (asset?.width !== 3840 || asset?.height !== 2160) throw new HttpError(400, 'honours_image_must_be_4k');
    source = imageSource(asset);
    activeSelection = { kind: 'honours', assetId: asset.assetId, name: asset.name };
  } else {
    throw new HttpError(400, 'unsupported_action');
  }

  const item = { ...current, revision, source, activeSelection, override, updatedAt: now, updatedBy: actor.email };
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
  updateDevice,
  verifyToken,
  now = () => new Date().toISOString(),
  newAssetId = randomUUID,
}) {
  return async function handle(event) {
    try {
      const method = event?.requestContext?.http?.method;
      const rawPath = event?.rawPath ?? '';

      if (method === 'GET') {
        const publicDeviceId = deviceIdFromConfigPath(rawPath);
        if (publicDeviceId) {
          const item = await getDevice(publicDeviceId);
          if (!item) return publicResponse(404, { error: 'device_not_found' });
          const etag = `"${publicDeviceId}-${item.revision}"`;
          const requestEtag = event?.headers?.['if-none-match'] ?? event?.headers?.['If-None-Match'];
          if (requestEtag === etag) return publicResponse(304, undefined, { etag });
          return publicResponse(200, publicConfig(item), { etag });
        }
      }

      if (!rawPath.startsWith('/admin/')) return response(404, { error: 'not_found' });
      const actor = await verifyToken(bearerToken(event?.headers));

      if (method === 'GET' && rawPath === '/admin/programmes') {
        const items = await listProgrammes();
        return response(200, { programmes: items.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map(publicProgramme) });
      }

      if (method === 'GET' && rawPath === '/admin/assets') {
        const items = await listAssets();
        return response(200, {
          assets: items.filter((item) => item.status === 'ready').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicAsset),
        });
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
          uploadHeaders: { 'content-type': asset.mimeType, 'x-amz-checksum-sha256': asset.checksumBase64 },
          expiresInSeconds: 300,
        });
      }

      const completeAssetId = assetIdFromCompletePath(rawPath);
      if (method === 'POST' && completeAssetId) {
        const asset = await getAsset(completeAssetId);
        if (!asset) return response(404, { error: 'image_not_found' });
        if (asset.status === 'ready') return response(200, { asset: publicAsset(asset) });
        const stored = await headAsset(asset);
        if (stored.byteSize !== asset.byteSize || stored.mimeType !== asset.mimeType || stored.checksumBase64 !== asset.checksumBase64) {
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
        return response(200, { device: adminDevice(item), actor: { email: actor.email, name: actor.name } });
      }

      const actionDeviceId = deviceIdFromActionPath(rawPath);
      if (method === 'POST' && actionDeviceId) {
        const action = parseBody(event);
        const needsProgramme = ['show_programme', 'set_event_override'].includes(action.action);
        const needsAsset = ['show_image', 'set_honours_image'].includes(action.action);
        if (needsProgramme && !PROGRAMME_ID_PATTERN.test(action.programmeId ?? '')) throw new HttpError(400, 'invalid_programme_id');
        if (needsAsset && !ASSET_ID_PATTERN.test(action.assetId ?? '')) throw new HttpError(400, 'invalid_asset_id');
        const [current, programme, asset] = await Promise.all([
          getDevice(actionDeviceId),
          needsProgramme ? getProgramme(action.programmeId) : Promise.resolve(undefined),
          needsAsset ? getAsset(action.assetId) : Promise.resolve(undefined),
        ]);
        const change = buildChange(current, action, programme, asset, actor, now());
        await updateDevice({ previousRevision: current.revision, ...change });
        return response(200, { device: adminDevice(change.item) });
      }

      if (!['GET', 'POST'].includes(method)) return response(405, { error: 'method_not_allowed' }, { allow: 'GET, POST' });
      return response(404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof HttpError) return response(error.statusCode, { error: error.message });
      if (error?.name === 'TransactionCanceledException') return response(409, { error: 'display_changed_retry' });
      console.error('control_api_error', error);
      return response(500, { error: 'internal_error' });
    }
  };
}

async function verifyGoogleToken(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const allowedEmails = new Set((process.env.COMMITTEE_ADMIN_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    const requiredDomain = (process.env.GOOGLE_HOSTED_DOMAIN ?? '').trim().toLowerCase();
    if (!payload?.sub || !email || payload.email_verified !== true) throw new HttpError(403, 'account_not_authorised');
    if (requiredDomain && payload.hd?.toLowerCase() !== requiredDomain) throw new HttpError(403, 'account_not_authorised');
    if (!allowedEmails.has(email)) throw new HttpError(403, 'account_not_authorised');
    return { sub: payload.sub, email, name: payload.name ?? email };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'invalid_google_credential');
  }
}

export const handler = createHandler({
  async getDevice(deviceId) {
    const result = await documentClient.send(new GetCommand({ TableName: process.env.DEVICE_CONFIG_TABLE, Key: { deviceId }, ConsistentRead: false }));
    return result.Item;
  },
  async getProgramme(programmeId) {
    const result = await documentClient.send(new GetCommand({ TableName: process.env.PROGRAMME_TABLE, Key: { programmeId }, ConsistentRead: false }));
    return result.Item;
  },
  async listProgrammes() {
    const result = await documentClient.send(new ScanCommand({ TableName: process.env.PROGRAMME_TABLE, Limit: 50 }));
    return result.Items ?? [];
  },
  async getAsset(assetId) {
    const result = await documentClient.send(new GetCommand({ TableName: process.env.ASSET_TABLE, Key: { assetId }, ConsistentRead: false }));
    return result.Item;
  },
  async listAssets() {
    const result = await documentClient.send(new ScanCommand({ TableName: process.env.ASSET_TABLE, Limit: 100 }));
    return result.Items ?? [];
  },
  async putAsset(asset) {
    await documentClient.send(new PutCommand({ TableName: process.env.ASSET_TABLE, Item: asset, ConditionExpression: 'attribute_not_exists(assetId)' }));
  },
  async completeAsset(asset) {
    await documentClient.send(new PutCommand({
      TableName: process.env.ASSET_TABLE,
      Item: asset,
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending' },
    }));
  },
  async createUploadUrl(asset) {
    return getSignedUrl(s3Client, new PutObjectCommand({
      Bucket: process.env.ASSET_BUCKET,
      Key: asset.objectKey,
      ContentType: asset.mimeType,
      ChecksumSHA256: asset.checksumBase64,
    }), { expiresIn: 300 });
  },
  async headAsset(asset) {
    const result = await s3Client.send(new HeadObjectCommand({ Bucket: process.env.ASSET_BUCKET, Key: asset.objectKey, ChecksumMode: 'ENABLED' }));
    return { byteSize: result.ContentLength, mimeType: result.ContentType, checksumBase64: result.ChecksumSHA256 };
  },
  async updateDevice({ previousRevision, item, audit }) {
    await documentClient.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: process.env.DEVICE_CONFIG_TABLE, Item: item, ConditionExpression: 'revision = :previousRevision', ExpressionAttributeValues: { ':previousRevision': previousRevision } } },
        { Put: { TableName: process.env.AUDIT_TABLE, Item: audit, ConditionExpression: 'attribute_not_exists(changedAt)' } },
      ],
    }));
  },
  verifyToken: verifyGoogleToken,
});
