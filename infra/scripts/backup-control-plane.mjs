#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  BACKUP_SCHEMA_VERSION,
  DATA_OUTPUTS,
  option,
  requiredOutput,
  safeObjectFile,
  sha256,
  stackOutputs,
} from './backup-support.mjs';

async function scanAll(client, tableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        ConsistentRead: true,
        ExclusiveStartKey,
      }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function listObjects(client, bucket) {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'display-assets/',
        ContinuationToken,
      }),
    );
    objects.push(...(page.Contents ?? []).filter((item) => item.Key));
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return objects;
}

async function listConvenors(client, userPoolId) {
  const users = [];
  let PaginationToken;
  do {
    const page = await client.send(
      new ListUsersCommand({ UserPoolId: userPoolId, PaginationToken }),
    );
    for (const user of page.Users ?? []) {
      const groups = await client.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: userPoolId,
          Username: user.Username,
        }),
      );
      users.push({
        username: user.Username,
        enabled: user.Enabled,
        status: user.UserStatus,
        attributes: user.Attributes ?? [],
        groups: (groups.Groups ?? [])
          .map((group) => group.GroupName)
          .filter(Boolean),
      });
    }
    PaginationToken = page.PaginationToken;
  } while (PaginationToken);
  return users;
}

export async function createBackup({ region, stackName, outputDirectory }) {
  const outputs = await stackOutputs({ region, stackName });
  const directory = path.resolve(outputDirectory);
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  await mkdir(directory, { recursive: false, mode: 0o700 });
  await mkdir(path.join(directory, 'data'), { mode: 0o700 });
  await mkdir(path.join(directory, 'objects'), { mode: 0o700 });

  const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const s3 = new S3Client({ region });
  const cognito = new CognitoIdentityProviderClient({ region });
  const files = [];
  const tableCounts = {};

  for (const [name, outputKey] of Object.entries(DATA_OUTPUTS)) {
    const tableName = requiredOutput(outputs, outputKey);
    const items = await scanAll(dynamodb, tableName);
    const body = Buffer.from(`${JSON.stringify(items, null, 2)}\n`);
    const relativePath = `data/${name}.json`;
    await writeFile(path.join(directory, relativePath), body, {
      flag: 'wx',
      mode: 0o600,
    });
    files.push({
      path: relativePath,
      bytes: body.byteLength,
      sha256: sha256(body),
    });
    tableCounts[name] = items.length;
  }

  const userPoolId = requiredOutput(outputs, 'ConvenorUserPoolId');
  const convenors = await listConvenors(cognito, userPoolId);
  const convenorBody = Buffer.from(`${JSON.stringify(convenors, null, 2)}\n`);
  await writeFile(path.join(directory, 'data/convenors.json'), convenorBody, {
    flag: 'wx',
    mode: 0o600,
  });
  files.push({
    path: 'data/convenors.json',
    bytes: convenorBody.byteLength,
    sha256: sha256(convenorBody),
  });

  const bucket = requiredOutput(outputs, 'WebsiteBucketName');
  const objectManifest = [];
  for (const listed of await listObjects(s3, bucket)) {
    const key = listed.Key;
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = Buffer.from(await response.Body.transformToByteArray());
    const relativePath = safeObjectFile(key);
    await writeFile(path.join(directory, relativePath), body, {
      flag: 'wx',
      mode: 0o600,
    });
    const file = {
      path: relativePath,
      bytes: body.byteLength,
      sha256: sha256(body),
    };
    files.push(file);
    objectManifest.push({
      key,
      ...file,
      contentType: response.ContentType ?? 'application/octet-stream',
      cacheControl: response.CacheControl,
    });
  }

  const createdAt = new Date().toISOString();
  const manifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    source: {
      region,
      stackName,
      controlRoomUrl: outputs.ControlRoomUrl,
      deploymentIdentity: outputs.DeploymentIdentity,
    },
    contents: {
      tables: tableCounts,
      convenors: convenors.length,
      objects: objectManifest,
      excluded: ['ControlSessions'],
    },
    files,
  };
  await writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  return { directory, manifest };
}

function defaultDirectory() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z');
  return path.resolve(process.cwd(), '..', '.private-aws-backups', timestamp);
}

async function main() {
  const argv = process.argv.slice(2);
  const region =
    option(argv, '--region') ?? process.env.AWS_REGION ?? 'ap-southeast-2';
  const stackName = option(argv, '--stack') ?? 'OpenCourtControl';
  const profile = option(argv, '--profile');
  if (profile) process.env.AWS_PROFILE = profile;
  const result = await createBackup({
    region,
    stackName,
    outputDirectory: option(argv, '--output') ?? defaultDirectory(),
  });
  process.stdout.write(
    `Backup complete: ${result.directory}\n` +
      `Tables: ${JSON.stringify(result.manifest.contents.tables)}\n` +
      `Convenors: ${result.manifest.contents.convenors}; objects: ${result.manifest.contents.objects.length}\n` +
      'Control sessions were intentionally excluded.\n',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
