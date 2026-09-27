import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=0, must-revalidate',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function deviceIdFromPath(rawPath = '') {
  const match = rawPath.match(/^\/devices\/([^/]+)\/config$/);
  if (!match) return null;
  try {
    const deviceId = decodeURIComponent(match[1]);
    return DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null;
  } catch {
    return null;
  }
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

export function createHandler({ getDevice }) {
  return async function handle(event) {
    const method = event?.requestContext?.http?.method;
    if (method !== 'GET') return response(405, { error: 'method_not_allowed' }, { allow: 'GET' });

    const deviceId = deviceIdFromPath(event?.rawPath);
    if (!deviceId) return response(404, { error: 'not_found' });

    const item = await getDevice(deviceId);
    if (!item) return response(404, { error: 'device_not_found' });

    const etag = `"${deviceId}-${item.revision}"`;
    const requestEtag = event?.headers?.['if-none-match'] ?? event?.headers?.['If-None-Match'];
    if (requestEtag === etag) {
      return response(304, undefined, { etag });
    }

    return response(200, publicConfig(item), { etag });
  };
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
});
