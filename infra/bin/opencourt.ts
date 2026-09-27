#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { OpenCourtControlStack } from '../lib/opencourt-control-stack.js';

const app = new cdk.App();

new OpenCourtControlStack(app, 'OpenCourtControl', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-2',
  },
  description: 'Cost-minimal OpenCourt display configuration control plane',
  terminationProtection: true,
});
