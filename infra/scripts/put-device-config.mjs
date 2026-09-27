#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function validateDeviceConfig(config) {
  if (config?.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (!DEVICE_ID_PATTERN.test(config?.deviceId ?? '')) throw new Error('deviceId is invalid');
  if (!Number.isInteger(config?.revision) || config.revision < 1) {
    throw new Error('revision must be a positive integer');
  }
  if (!Number.isInteger(config?.pollIntervalSeconds) || config.pollIntervalSeconds < 15 || config.pollIntervalSeconds > 3600) {
    throw new Error('pollIntervalSeconds must be an integer from 15 to 3600');
  }

  const source = config?.source;
  if (!source || !['image', 'google_slides'].includes(source.type)) {
    throw new Error('source type must be image or google_slides');
  }

  if (source.type === 'image') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(source.url ?? '')) {
      throw new Error('image URL must be a local filename');
    }
  } else {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/presentation/d/')) {
      throw new Error('Google Slides URL is invalid');
    }
  }

  return config;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const tableName = option('--table');
  const fileName = option('--file');
  const region = option('--region') ?? process.env.AWS_REGION ?? 'ap-southeast-2';
  if (!tableName || !fileName) {
    throw new Error('Usage: npm run seed -- --table TABLE_NAME --file CONFIG.json [--region REGION]');
  }

  const config = validateDeviceConfig(JSON.parse(await readFile(fileName, 'utf8')));
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...config,
        updatedAt: new Date().toISOString(),
        updatedBy: 'bootstrap-cli',
      },
      ConditionExpression: 'attribute_not_exists(deviceId) OR revision < :revision',
      ExpressionAttributeValues: { ':revision': config.revision },
    }),
  );
  process.stdout.write(`Published ${config.deviceId} revision ${config.revision}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
