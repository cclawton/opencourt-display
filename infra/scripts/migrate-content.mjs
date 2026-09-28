#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function contentFromProgramme(programme, timestamp) {
  return {
    contentId: programme.programmeId,
    title: programme.name,
    type: 'slideshow',
    provider: 'google_slides',
    status: 'ready',
    source: programme.source,
    sortOrder: programme.sortOrder,
    createdAt: timestamp,
    createdBy: 'legacy-migration',
    updatedAt: timestamp,
    updatedBy: 'legacy-migration',
  };
}

export function contentFromDevice(device, timestamp) {
  return {
    contentId: 'honours-board',
    title: 'Honours Board',
    type: 'image',
    provider: 'local_image',
    status: 'ready',
    source: device.defaultSource ?? device.source,
    mimeType: 'image/jpeg',
    width: 3840,
    height: 2160,
    createdAt: timestamp,
    createdBy: 'legacy-migration',
    updatedAt: timestamp,
    updatedBy: 'legacy-migration',
  };
}

async function main() {
  const deviceTable = option('--device-table');
  const programmeTable = option('--programme-table');
  const assetTable = option('--asset-table');
  const contentTable = option('--content-table');
  const deviceId = option('--device-id') ?? 'honours-board-tv';
  const region = option('--region') ?? process.env.AWS_REGION ?? 'ap-southeast-2';
  if (!deviceTable || !programmeTable || !assetTable || !contentTable) {
    throw new Error('Pass --device-table, --programme-table, --asset-table and --content-table.');
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const [deviceResult, programmeResult, assetResult] = await Promise.all([
    client.send(new GetCommand({ TableName: deviceTable, Key: { deviceId } })),
    client.send(new ScanCommand({ TableName: programmeTable, Limit: 50 })),
    client.send(new ScanCommand({ TableName: assetTable, Limit: 100 })),
  ]);
  if (!deviceResult.Item) throw new Error(`Device ${deviceId} was not found.`);

  const timestamp = new Date().toISOString();
  const content = [
    contentFromDevice(deviceResult.Item, timestamp),
    ...(programmeResult.Items ?? []).map((programme) => contentFromProgramme(programme, timestamp)),
    ...(assetResult.Items ?? []).filter((asset) => asset.status === 'ready').map((asset) => ({
      contentId: `image-${asset.assetId}`,
      title: asset.name,
      type: 'image',
      provider: 'uploaded_image',
      status: 'ready',
      source: {
        type: 'image',
        url: asset.publicUrl,
        mimeType: asset.mimeType,
        expectedWidth: asset.width,
        expectedHeight: asset.height,
        sha256: asset.sha256,
      },
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      objectKey: asset.objectKey,
      createdAt: asset.createdAt ?? timestamp,
      createdBy: asset.createdBy ?? 'legacy-migration',
      updatedAt: timestamp,
      updatedBy: 'legacy-migration',
    })),
  ];

  for (const item of content) {
    await client.send(new PutCommand({
      TableName: contentTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(contentId)',
    }));
  }
  process.stdout.write(`Migrated ${content.length} content items.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
