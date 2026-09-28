import assert from 'node:assert/strict';
import test from 'node:test';

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { OpenCourtControlStack } from '../dist/lib/opencourt-control-stack.js';

test('control API can read and transactionally update the device configuration', () => {
  const app = new cdk.App();
  const stack = new OpenCourtControlStack(app, 'TestOpenCourtControl', {
    env: { account: '111111111111', region: 'ap-southeast-2' },
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith(['dynamodb:GetItem', 'dynamodb:PutItem']),
          Effect: 'Allow',
          Resource: { 'Fn::GetAtt': [Match.stringLikeRegexp('DeviceConfigurations'), 'Arn'] },
        }),
      ]),
    },
  });

  const policies = template.findResources('AWS::IAM::Policy');
  assert.ok(Object.keys(policies).length > 0);

  const tables = template.findResources('AWS::DynamoDB::Table');
  assert.ok(Object.keys(tables).some((logicalId) => logicalId.startsWith('DeviceConfigurations')));
  assert.ok(Object.keys(tables).some((logicalId) => logicalId.startsWith('Programmes')));
  assert.ok(Object.keys(tables).some((logicalId) => logicalId.startsWith('DisplayAssets')));
  assert.ok(Object.keys(tables).some((logicalId) => logicalId.startsWith('ContentItems')));
  assert.equal(Object.keys(tables).length, 5);
});
