#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function validateProgramme(programme) {
  if (!ID_PATTERN.test(programme?.programmeId ?? '')) throw new Error('programmeId is invalid');
  if (typeof programme.name !== 'string' || programme.name.length < 2 || programme.name.length > 100) throw new Error('programme name is invalid');
  if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(programme.day)) throw new Error('programme day is invalid');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(programme.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(programme.endTime)) throw new Error('programme time is invalid');
  if (!Array.isArray(programme.activities) || programme.activities.length === 0 || programme.activities.some((activity) => typeof activity !== 'string')) throw new Error('programme activities are invalid');
  if (programme.source?.type !== 'google_slides') throw new Error('programme source must be google_slides');
  const url = new URL(programme.source.url);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/presentation/d/')) throw new Error('programme Google Slides URL is invalid');
  return programme;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const tableName = option('--table');
  const fileName = option('--file');
  const region = option('--region') ?? process.env.AWS_REGION ?? 'ap-southeast-2';
  if (!tableName || !fileName) throw new Error('Usage: npm run seed-programmes -- --table TABLE_NAME --file PROGRAMMES.json [--region REGION]');
  const programmes = JSON.parse(await readFile(fileName, 'utf8'));
  if (!Array.isArray(programmes) || programmes.length === 0 || programmes.length > 50) throw new Error('programmes must be a non-empty array of at most 50 entries');
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  for (const programme of programmes.map(validateProgramme)) {
    await client.send(new PutCommand({ TableName: tableName, Item: programme }));
  }
  process.stdout.write(`Published ${programmes.length} programmes.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
