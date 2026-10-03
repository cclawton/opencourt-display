#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';

import {
  BACKUP_SCHEMA_VERSION,
  DATA_KEYS,
  DATA_OUTPUTS,
  hasFlag,
  option,
  readJson,
  requiredOutput,
  rewriteBaseUrl,
  stackOutputs,
  verifyBackupFiles,
} from './backup-support.mjs';

async function assertEmpty({ dynamodb, s3, cognito, outputs }) {
  for (const outputKey of Object.values(DATA_OUTPUTS)) {
    const tableName = requiredOutput(outputs, outputKey);
    const result = await dynamodb.send(
      new ScanCommand({ TableName: tableName, Limit: 1, Select: 'COUNT' }),
    );
    if ((result.Count ?? 0) > 0)
      throw new Error(
        `Target table ${tableName} is not empty. Use --overwrite to merge/replace records.`,
      );
  }
  const bucket = requiredOutput(outputs, 'WebsiteBucketName');
  const objects = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'display-assets/',
      MaxKeys: 1,
    }),
  );
  if ((objects.KeyCount ?? 0) > 0)
    throw new Error(
      'Target display-assets prefix is not empty. Use --overwrite to replace matching objects.',
    );
  const users = await cognito.send(
    new ListUsersCommand({
      UserPoolId: requiredOutput(outputs, 'ConvenorUserPoolId'),
      Limit: 1,
    }),
  );
  if ((users.Users ?? []).length)
    throw new Error(
      'Target convenor user pool is not empty. Use --overwrite to skip existing usernames.',
    );
}

async function batchPut(client, tableName, items) {
  for (let offset = 0; offset < items.length; offset += 25) {
    let requests = items
      .slice(offset, offset + 25)
      .map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 0; requests.length; attempt += 1) {
      if (attempt >= 8)
        throw new Error(`DynamoDB did not accept all writes for ${tableName}.`);
      const result = await client.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: requests } }),
      );
      requests = result.UnprocessedItems?.[tableName] ?? [];
      if (requests.length)
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 100));
    }
  }
}

async function batchDelete(client, tableName, keys) {
  for (let offset = 0; offset < keys.length; offset += 25) {
    let requests = keys
      .slice(offset, offset + 25)
      .map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length; attempt += 1) {
      if (attempt >= 8)
        throw new Error(
          `DynamoDB did not accept all deletes for ${tableName}.`,
        );
      const result = await client.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: requests } }),
      );
      requests = result.UnprocessedItems?.[tableName] ?? [];
      if (requests.length)
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 100));
    }
  }
}

async function clearTarget({ dynamodb, s3, cognito, outputs }) {
  for (const [name, outputKey] of Object.entries(DATA_OUTPUTS)) {
    const tableName = requiredOutput(outputs, outputKey);
    const keyNames = DATA_KEYS[name];
    const keys = [];
    let ExclusiveStartKey;
    do {
      const page = await dynamodb.send(
        new ScanCommand({ TableName: tableName, ExclusiveStartKey }),
      );
      keys.push(
        ...(page.Items ?? []).map((item) =>
          Object.fromEntries(keyNames.map((key) => [key, item[key]])),
        ),
      );
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    await batchDelete(dynamodb, tableName, keys);
  }

  const bucket = requiredOutput(outputs, 'WebsiteBucketName');
  let ContinuationToken;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'display-assets/',
        ContinuationToken,
      }),
    );
    const Objects = (page.Contents ?? [])
      .filter((item) => item.Key)
      .map((item) => ({ Key: item.Key }));
    if (Objects.length)
      await s3.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects } }),
      );
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);

  const userPoolId = requiredOutput(outputs, 'ConvenorUserPoolId');
  let PaginationToken;
  do {
    const page = await cognito.send(
      new ListUsersCommand({ UserPoolId: userPoolId, PaginationToken }),
    );
    for (const user of page.Users ?? [])
      if (user.Username)
        await cognito.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: user.Username,
          }),
        );
    PaginationToken = page.PaginationToken;
  } while (PaginationToken);
}

async function restoreConvenors(client, userPoolId, users, overwrite) {
  const existing = await client.send(
    new ListUsersCommand({ UserPoolId: userPoolId }),
  );
  const existingNames = new Set(
    (existing.Users ?? []).map((user) => user.Username),
  );
  for (const user of users) {
    if (!user.username) continue;
    const attributes = (user.attributes ?? []).filter(
      (attribute) => attribute.Name !== 'sub',
    );
    if (!existingNames.has(user.username)) {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: user.username,
          MessageAction: 'SUPPRESS',
          UserAttributes: attributes,
        }),
      );
    } else if (!overwrite) {
      throw new Error(`Convenor ${user.username} already exists.`);
    } else {
      await client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: user.username,
          UserAttributes: attributes,
        }),
      );
    }
    for (const groupName of user.groups ?? [])
      await client.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: user.username,
          GroupName: groupName,
        }),
      );
    if (user.enabled === false)
      await client.send(
        new AdminDisableUserCommand({
          UserPoolId: userPoolId,
          Username: user.username,
        }),
      );
    else
      await client.send(
        new AdminEnableUserCommand({
          UserPoolId: userPoolId,
          Username: user.username,
        }),
      );
  }
}

export async function restoreBackup({
  region,
  stackName,
  backupDirectory,
  overwrite = false,
  replace = false,
}) {
  const directory = pathToFileURL(
    `${path.resolve(backupDirectory)}${path.sep}`,
  );
  const manifest = await readJson(new URL('manifest.json', directory));
  if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION)
    throw new Error(`Unsupported backup schema ${manifest.schemaVersion}.`);
  await verifyBackupFiles(directory, manifest);

  const outputs = await stackOutputs({ region, stackName });
  const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const s3 = new S3Client({ region });
  const cognito = new CognitoIdentityProviderClient({ region });
  if (replace) await clearTarget({ dynamodb, s3, cognito, outputs });
  else if (!overwrite) await assertEmpty({ dynamodb, s3, cognito, outputs });

  const sourceBaseUrl = manifest.source?.controlRoomUrl;
  const targetBaseUrl = requiredOutput(outputs, 'ControlRoomUrl');
  const bucket = requiredOutput(outputs, 'WebsiteBucketName');
  for (const object of manifest.contents?.objects ?? []) {
    const body = await readFile(new URL(object.path, directory));
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: object.key,
        Body: body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl,
      }),
    );
  }

  const restoredCounts = {};
  for (const [name, outputKey] of Object.entries(DATA_OUTPUTS)) {
    const rawItems = await readJson(new URL(`data/${name}.json`, directory));
    const items = rewriteBaseUrl(rawItems, sourceBaseUrl, targetBaseUrl);
    await batchPut(dynamodb, requiredOutput(outputs, outputKey), items);
    restoredCounts[name] = items.length;
  }

  const convenors = await readJson(new URL('data/convenors.json', directory));
  await restoreConvenors(
    cognito,
    requiredOutput(outputs, 'ConvenorUserPoolId'),
    convenors,
    overwrite,
  );
  return {
    restoredCounts,
    objects: manifest.contents?.objects?.length ?? 0,
    convenors: convenors.length,
    sourceBaseUrl,
    targetBaseUrl,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const backupDirectory = option(argv, '--backup');
  if (!backupDirectory)
    throw new Error(
      'Usage: npm run restore -- --backup DIRECTORY [--apply] [--stack NAME] [--region REGION] [--profile PROFILE] [--overwrite|--replace]',
    );
  const region =
    option(argv, '--region') ?? process.env.AWS_REGION ?? 'ap-southeast-2';
  const stackName = option(argv, '--stack') ?? 'OpenCourtControl';
  const profile = option(argv, '--profile');
  if (profile) process.env.AWS_PROFILE = profile;
  if (hasFlag(argv, '--overwrite') && hasFlag(argv, '--replace'))
    throw new Error(
      'Choose either --overwrite (merge) or --replace (exact rollback), not both.',
    );
  if (!hasFlag(argv, '--apply')) {
    const directory = pathToFileURL(
      `${path.resolve(backupDirectory)}${path.sep}`,
    );
    const manifest = await readJson(new URL('manifest.json', directory));
    if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION)
      throw new Error(`Unsupported backup schema ${manifest.schemaVersion}.`);
    await verifyBackupFiles(directory, manifest);
    const outputs = await stackOutputs({ region, stackName });
    process.stdout.write(
      `Backup verified. No changes made.\n` +
        `Source: ${manifest.source?.region}/${manifest.source?.stackName} (${manifest.source?.deploymentIdentity ?? 'unknown'})\n` +
        `Target: ${region}/${stackName} (${outputs.DeploymentIdentity ?? 'unknown'})\n` +
        `Tables: ${JSON.stringify(manifest.contents?.tables ?? {})}\n` +
        `Convenors: ${manifest.contents?.convenors ?? 0}; objects: ${manifest.contents?.objects?.length ?? 0}\n` +
        'After checking aws sts get-caller-identity, rerun with --apply.\n',
    );
    return;
  }
  const result = await restoreBackup({
    region,
    stackName,
    backupDirectory,
    overwrite: hasFlag(argv, '--overwrite'),
    replace: hasFlag(argv, '--replace'),
  });
  process.stdout.write(
    `Restore complete in ${region}/${stackName}.\n` +
      `Tables: ${JSON.stringify(result.restoredCounts)}\n` +
      `Convenors: ${result.convenors}; objects: ${result.objects}\n` +
      `Asset URLs rewritten from ${result.sourceBaseUrl} to ${result.targetBaseUrl}.\n` +
      'Browser sessions were not restored; users must sign in again.\n',
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
