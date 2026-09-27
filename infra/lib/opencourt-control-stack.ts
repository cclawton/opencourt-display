import * as path from 'node:path';

import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export class OpenCourtControlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const billingAlertEmail = new cdk.CfnParameter(this, 'BillingAlertEmail', {
      type: 'String',
      description: 'Address that receives monthly AWS cost alerts at USD $1, $5 and $10.',
      allowedPattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      constraintDescription: 'Enter a valid email address.',
    });

    const clubSlug = new cdk.CfnParameter(this, 'ClubSlug', {
      type: 'String',
      default: 'heatherdale',
      description: 'Short lowercase club identifier used in resource names and tags.',
      allowedPattern: '^[a-z0-9][a-z0-9-]{1,19}$',
      constraintDescription: 'Use 2-20 lowercase letters, digits or hyphens.',
    });

    const deploymentStage = new cdk.CfnParameter(this, 'DeploymentStage', {
      type: 'String',
      default: 'pilot',
      description: 'Lifecycle stage for this deployment.',
      allowedValues: ['pilot', 'production'],
    });

    const deploymentOwner = new cdk.CfnParameter(this, 'DeploymentOwner', {
      type: 'String',
      default: 'personal-pilot',
      description: 'Operational owner identifier; use club-owned after account migration.',
      allowedPattern: '^[a-z0-9][a-z0-9-]{1,31}$',
      constraintDescription: 'Use 2-32 lowercase letters, digits or hyphens.',
    });

    const resourcePrefix = cdk.Fn.join('-', [
      'opencourt',
      clubSlug.valueAsString,
      deploymentStage.valueAsString,
    ]);

    const table = new dynamodb.Table(this, 'DeviceConfigurations', {
      tableName: cdk.Fn.join('-', [resourcePrefix, 'device-configurations']),
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const functionName = cdk.Fn.join('-', [resourcePrefix, 'control-api']);
    new logs.LogGroup(this, 'ControlApiLogs', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const controlApi = new lambdaNodejs.NodejsFunction(this, 'ControlApi', {
      functionName,
      entry: path.join(process.cwd(), 'functions/control-api.mjs'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      reservedConcurrentExecutions: 2,
      environment: {
        DEVICE_CONFIG_TABLE: table.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: false,
      },
    });
    controlApi.node.addDependency(table);
    table.grant(controlApi, 'dynamodb:GetItem');

    const functionUrl = controlApi.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
        allowedHeaders: ['if-none-match'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    new budgets.CfnBudget(this, 'MonthlyCostGuardrail', {
      budget: {
        budgetName: cdk.Fn.join('-', [resourcePrefix, 'monthly-cost-guardrail']),
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 10, unit: 'USD' },
        costFilters: {
          Service: ['AWS Lambda', 'Amazon DynamoDB', 'AmazonCloudWatch'],
        },
      },
      notificationsWithSubscribers: [1, 5, 10].map((threshold) => ({
        notification: {
          comparisonOperator: 'GREATER_THAN',
          notificationType: 'ACTUAL',
          threshold,
          thresholdType: 'ABSOLUTE_VALUE',
        },
        subscribers: [
          {
            address: billingAlertEmail.valueAsString,
            subscriptionType: 'EMAIL',
          },
        ],
      })),
    });

    const deploymentTagOptions: cdk.TagProps = {
      excludeResourceTypes: ['aws:cdk:stack'],
    };

    cdk.Tags.of(this).add('Application', 'OpenCourt Display');
    cdk.Tags.of(this).add('Club', clubSlug.valueAsString, deploymentTagOptions);
    cdk.Tags.of(this).add('DataClassification', 'public-device-configuration');
    cdk.Tags.of(this).add(
      'DeploymentStage',
      deploymentStage.valueAsString,
      deploymentTagOptions,
    );
    cdk.Tags.of(this).add('ManagedBy', 'AWS CDK');
    cdk.Tags.of(this).add('MigrationTarget', 'club-owned-aws-account');
    cdk.Tags.of(this).add(
      'OperationalOwner',
      deploymentOwner.valueAsString,
      deploymentTagOptions,
    );
    cdk.Tags.of(this).add('Repository', 'github.com/cclawton/opencourt-display');

    new cdk.CfnOutput(this, 'DeviceConfigTableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'DeviceConfigBaseUrl', { value: functionUrl.url });
    new cdk.CfnOutput(this, 'DeploymentIdentity', {
      value: cdk.Fn.join('/', [
        clubSlug.valueAsString,
        deploymentStage.valueAsString,
        deploymentOwner.valueAsString,
      ]),
    });
  }
}
