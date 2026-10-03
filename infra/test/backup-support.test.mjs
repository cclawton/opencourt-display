import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  rewriteBaseUrl,
  safeObjectFile,
  sha256,
  verifyBackupFiles,
} from '../scripts/backup-support.mjs';

test('rewrites only source CloudFront URLs throughout restored records', () => {
  const source = 'https://old.example.test';
  const target = 'https://new.example.test';
  const value = {
    publicUrl: `${source}/display-assets/one/image.png`,
    schedule: {
      entries: [
        { source: { url: `${source}/display-assets/two/image.jpg` } },
        {
          source: { url: 'https://docs.google.com/presentation/d/example/pub' },
        },
      ],
    },
  };
  assert.deepEqual(rewriteBaseUrl(value, `${source}/`, `${target}/`), {
    publicUrl: `${target}/display-assets/one/image.png`,
    schedule: {
      entries: [
        { source: { url: `${target}/display-assets/two/image.jpg` } },
        {
          source: { url: 'https://docs.google.com/presentation/d/example/pub' },
        },
      ],
    },
  });
});

test('maps S3 keys to safe local filenames', () => {
  const file = safeObjectFile('display-assets/item/file name.png');
  assert.match(file, /^objects\/[A-Za-z0-9_-]+$/);
  assert.equal(file.includes('..'), false);
  assert.equal(file.includes('display-assets'), false);
});

test('verifies backup sizes and checksums before restore', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'opencourt-backup-test-'),
  );
  await mkdir(path.join(directory, 'data'));
  const body = Buffer.from('[{"deviceId":"test"}]\n');
  await writeFile(path.join(directory, 'data/devices.json'), body);
  const url = pathToFileURL(`${directory}${path.sep}`);
  await verifyBackupFiles(url, {
    files: [
      {
        path: 'data/devices.json',
        bytes: body.byteLength,
        sha256: sha256(body),
      },
    ],
  });
  await assert.rejects(
    verifyBackupFiles(url, {
      files: [
        {
          path: 'data/devices.json',
          bytes: body.byteLength,
          sha256: '0'.repeat(64),
        },
      ],
    }),
    /checksum mismatch/,
  );
});
