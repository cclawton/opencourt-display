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
          Resource: {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('DeviceConfigurations'),
              'Arn',
            ],
          },
        }),
      ]),
    },
  });

  const policies = template.findResources('AWS::IAM::Policy');
  assert.ok(Object.keys(policies).length > 0);

  assert.equal(template.toJSON().Outputs.HonoursBoardTableName, undefined);
  for (const resource of Object.values(
    template.findResources('AWS::Lambda::Function'),
  )) {
    assert.equal(
      resource.Properties.Environment?.Variables?.HONOURS_BOARD_TABLE,
      undefined,
    );
  }

  const tables = template.findResources('AWS::DynamoDB::Table');
  assert.ok(
    Object.keys(tables).some((logicalId) =>
      logicalId.startsWith('DeviceConfigurations'),
    ),
  );
  assert.ok(
    Object.keys(tables).some((logicalId) => logicalId.startsWith('Programmes')),
  );
  assert.ok(
    Object.keys(tables).some((logicalId) =>
      logicalId.startsWith('DisplayAssets'),
    ),
  );
  assert.ok(
    Object.keys(tables).some((logicalId) =>
      logicalId.startsWith('ContentItems'),
    ),
  );
  assert.ok(
    Object.keys(tables).some((logicalId) =>
      logicalId.startsWith('ControlSessions'),
    ),
  );
  assert.equal(
    Object.keys(tables).some((id) => id.startsWith('HonoursBoardData')),
    false,
  );
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
  });
  assert.equal(Object.keys(tables).length, 6);
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    DeletionProtection: 'ACTIVE',
    UserPoolTier: 'ESSENTIALS',
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_AUTH']),
    GenerateSecret: false,
    RefreshTokenValidity: 90,
  });
  template.resourceCountIs('AWS::SES::EmailIdentity', 3);
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    RetentionInDays: 14,
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    LoggingConfig: {
      ApplicationLogLevel: 'ERROR',
      LogFormat: 'JSON',
      SystemLogLevel: 'WARN',
    },
    ReservedConcurrentExecutions: 10,
  });
  template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
    DashboardName: Match.anyValue(),
    DashboardBody: Match.anyValue(),
  });
  const dashboard = JSON.stringify(
    template.findResources('AWS::CloudWatch::Dashboard'),
  );
  for (const metric of [
    'Invocations',
    'Errors',
    'Throttles',
    'Duration',
    'ConcurrentExecutions',
  ]) {
    assert.match(dashboard, new RegExp(metric));
  }
});

test('test deployments reuse SES identities while pilot keeps their original identities and email OTP opt-in', () => {
  const stack = new OpenCourtControlStack(
    new cdk.App(),
    'EmailIdentityIsolationTest',
    {
      env: { account: '111111111111', region: 'ap-southeast-2' },
      defaultDeploymentStage: 'test',
    },
  );
  const template = Template.fromStack(stack).toJSON();
  assert.deepEqual(template.Conditions.ManageEmailIdentities, {
    'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'DeploymentStage' }, 'test'] }],
  });
  const identities = Object.entries(template.Resources).filter(
    ([, resource]) => resource.Type === 'AWS::SES::EmailIdentity',
  );
  assert.deepEqual(
    identities.map(([id]) => id).sort(),
    [
      'EmailOtpSenderIdentity',
      'EmailOtpSandboxRecipientOneIdentity',
      'EmailOtpSandboxRecipientTwoIdentity',
    ].sort(),
  );
  for (const [, identity] of identities)
    assert.equal(identity.Condition, 'ManageEmailIdentities');
  assert.equal(template.Parameters.EnableConvenorEmailOtp.Default, 'false');
  assert.deepEqual(template.Conditions.ConvenorEmailOtpEnabled, {
    'Fn::Equals': [{ Ref: 'EnableConvenorEmailOtp' }, 'true'],
  });
  const pool = Object.values(template.Resources).find(
    (resource) => resource.Type === 'AWS::Cognito::UserPool',
  );
  assert.equal(pool.DependsOn.includes('EmailOtpSenderIdentity'), false);
  const enabledConfig = pool.Properties.EmailConfiguration['Fn::If'][1];
  const conditionalName = enabledConfig.SourceArn['Fn::Join'][1].find(
    (part) => part?.['Fn::If'],
  );
  assert.deepEqual(conditionalName, {
    'Fn::If': [
      'ManageEmailIdentities',
      { Ref: 'EmailOtpSenderIdentity' },
      { Ref: 'EmailOtpSender' },
    ],
  });
  // A conditional reference creates the managed dependency only in pilot/prod;
  // test resolves directly to the existing verified address.
  const selectIdentityName = (stage) =>
    stage === 'test'
      ? conditionalName['Fn::If'][2]
      : conditionalName['Fn::If'][1];
  assert.deepEqual(selectIdentityName('test'), { Ref: 'EmailOtpSender' });
  assert.deepEqual(selectIdentityName('pilot'), {
    Ref: 'EmailOtpSenderIdentity',
  });
});
