#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};

const stackName = option('--stack', 'OpenCourtControl');
const region = option('--region', 'ap-southeast-2');
const googleClientId = option('--google-client-id');
const deviceId = option('--device-id', 'honours-board-tv');
if (!googleClientId || googleClientId.includes('not-configured')) throw new Error('Pass a real --google-client-id before publishing the control room.');

const outputs = JSON.parse(execFileSync('aws', [
  'cloudformation', 'describe-stacks', '--stack-name', stackName, '--region', region,
  '--query', 'Stacks[0].Outputs', '--output', 'json',
], { encoding: 'utf8' }));
const output = (key) => outputs.find((entry) => entry.OutputKey === key)?.OutputValue;
const apiBaseUrl = output('DeviceConfigBaseUrl')?.replace(/\/$/, '');
const bucket = output('WebsiteBucketName');
const distributionId = output('ControlRoomDistributionId');
if (!apiBaseUrl || !bucket || !distributionId) throw new Error('The deployed stack is missing website outputs.');

const runtimePath = 'dist/runtime-config.js';
const previousRuntime = await readFile(runtimePath, 'utf8');
await writeFile(runtimePath, `window.OPENCOURT_WEB_CONFIG = ${JSON.stringify({ apiBaseUrl, googleClientId, deviceId })};\n`);
try {
  execFileSync('aws', ['s3', 'sync', 'dist', `s3://${bucket}`, '--region', region, '--delete', '--exclude', 'index.html', '--exclude', 'runtime-config.js', '--cache-control', 'public,max-age=31536000,immutable'], { stdio: 'inherit' });
  execFileSync('aws', ['s3', 'cp', 'dist/index.html', `s3://${bucket}/index.html`, '--region', region, '--cache-control', 'no-cache,no-store,must-revalidate', '--content-type', 'text/html; charset=utf-8'], { stdio: 'inherit' });
  execFileSync('aws', ['s3', 'cp', runtimePath, `s3://${bucket}/runtime-config.js`, '--region', region, '--cache-control', 'no-cache,no-store,must-revalidate', '--content-type', 'application/javascript'], { stdio: 'inherit' });
  execFileSync('aws', ['cloudfront', 'create-invalidation', '--distribution-id', distributionId, '--paths', '/*'], { stdio: 'inherit' });
  process.stdout.write(`Published control room at ${output('ControlRoomUrl')}\n`);
} finally {
  await writeFile(runtimePath, previousRuntime);
}
