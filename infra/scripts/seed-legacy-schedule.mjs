#!/usr/bin/env node
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

const schedule = [
  ['Monday', '17:10', '24:00', 'Monday Night'],
  ['Tuesday', '00:00', '14:00', 'Tuesday Mid-week Ladies'],
  ['Tuesday', '17:00', '24:00', 'Tuesday Night'],
  ['Wednesday', '17:00', '24:00', 'Wednesday Night'],
  ['Thursday', '00:00', '14:00', 'Thursday Mid-week Ladies'],
  ['Thursday', '17:00', '24:00', 'Thursday Night'],
  ['Saturday', '00:00', '12:30', 'Saturday Morning'],
  ['Saturday', '12:30', '18:00', 'Saturday Afternoon'],
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const deviceTable = option('--device-table');
  const contentTable = option('--content-table');
  const deviceId = option('--device-id') ?? 'honours-board-tv';
  const region =
    option('--region') ?? process.env.AWS_REGION ?? 'ap-southeast-2';
  if (!deviceTable || !contentTable)
    throw new Error('Pass --device-table and --content-table.');
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const [deviceResult, contentResult] = await Promise.all([
    client.send(
      new GetCommand({
        TableName: deviceTable,
        Key: { deviceId },
        ConsistentRead: true,
      }),
    ),
    client.send(new ScanCommand({ TableName: contentTable, Limit: 100 })),
  ]);
  const device = deviceResult.Item;
  if (!device) throw new Error(`Device ${deviceId} was not found.`);
  const byTitle = new Map(
    (contentResult.Items ?? [])
      .filter((item) => item.status === 'ready')
      .map((item) => [item.title, item]),
  );
  const resolve = (title) => {
    const item = byTitle.get(title);
    if (!item?.source)
      throw new Error(`Ready content named ${title} was not found.`);
    return { contentId: item.contentId, name: item.title, source: item.source };
  };
  const seeded = {
    timezone: 'Australia/Melbourne',
    fallback: resolve('Honours Board'),
    entries: schedule.map(([day, startTime, endTime, title]) => ({
      day,
      startTime,
      endTime,
      ...resolve(title),
    })),
  };
  const item = {
    ...device,
    revision: device.revision + 1,
    mode: 'schedule',
    schedule: seeded,
    source: seeded.fallback.source,
    activeSelection: { kind: 'schedule', name: 'Normal schedule' },
    updatedAt: new Date().toISOString(),
    updatedBy: 'legacy-schedule-seed',
  };
  await client.send(
    new PutCommand({
      TableName: deviceTable,
      Item: item,
      ConditionExpression: 'revision = :revision',
      ExpressionAttributeValues: { ':revision': device.revision },
    }),
  );
  process.stdout.write(
    `Seeded the legacy weekly schedule on ${deviceId}, revision ${item.revision}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
