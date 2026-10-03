import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';

export const BACKUP_SCHEMA_VERSION = 1;

export const DATA_OUTPUTS = {
  devices: 'DeviceConfigTableName',
  programmes: 'ProgrammeTableName',
  auditEvents: 'AuditTableName',
  displayAssets: 'AssetTableName',
  contentItems: 'ContentTableName',
};

export const DATA_KEYS = {
  devices: ['deviceId'],
  programmes: ['programmeId'],
  auditEvents: ['deviceId', 'changedAt'],
  displayAssets: ['assetId'],
  contentItems: ['contentId'],
};

export function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function hasFlag(argv, name) {
  return argv.includes(name);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function safeObjectFile(key) {
  return `objects/${Buffer.from(key).toString('base64url')}`;
}

export function rewriteBaseUrl(value, sourceBaseUrl, targetBaseUrl) {
  if (typeof value === 'string') {
    if (!sourceBaseUrl || !targetBaseUrl) return value;
    const source = sourceBaseUrl.replace(/\/$/, '');
    const target = targetBaseUrl.replace(/\/$/, '');
    return value === source || value.startsWith(`${source}/`)
      ? `${target}${value.slice(source.length)}`
      : value;
  }
  if (Array.isArray(value))
    return value.map((item) =>
      rewriteBaseUrl(item, sourceBaseUrl, targetBaseUrl),
    );
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteBaseUrl(item, sourceBaseUrl, targetBaseUrl),
      ]),
    );
  return value;
}

export async function readJson(fileName) {
  return JSON.parse(await readFile(fileName, 'utf8'));
}

export async function stackOutputs({ region, stackName }) {
  const client = new CloudFormationClient({ region });
  const response = await client.send(
    new DescribeStacksCommand({ StackName: stackName }),
  );
  const stack = response.Stacks?.[0];
  if (!stack) throw new Error(`Stack ${stackName} was not found in ${region}.`);
  if (!stack.StackStatus?.endsWith('_COMPLETE'))
    throw new Error(
      `Stack ${stackName} is not stable (${stack.StackStatus ?? 'unknown'}).`,
    );
  return Object.fromEntries(
    (stack.Outputs ?? [])
      .filter((item) => item.OutputKey && item.OutputValue)
      .map((item) => [item.OutputKey, item.OutputValue]),
  );
}

export function requiredOutput(outputs, key) {
  const value = outputs[key];
  if (!value) throw new Error(`Stack output ${key} is missing.`);
  return value;
}

export async function verifyBackupFiles(directory, manifest) {
  for (const file of manifest.files ?? []) {
    const body = await readFile(new URL(file.path, directory));
    if (body.byteLength !== file.bytes)
      throw new Error(`Backup size mismatch for ${file.path}.`);
    if (sha256(body) !== file.sha256)
      throw new Error(`Backup checksum mismatch for ${file.path}.`);
  }
}
