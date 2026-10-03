import * as path from 'node:path';

import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';

export class OpenCourtControlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const billingAlertEmail = new cdk.CfnParameter(this, 'BillingAlertEmail', {
      type: 'String',
      description:
        'Address that receives monthly AWS cost alerts at USD $1, $5 and $10.',
      allowedPattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      constraintDescription: 'Enter a valid email address.',
    });

    const clubSlug = new cdk.CfnParameter(this, 'ClubSlug', {
      type: 'String',
      default: 'heatherdale',
      description:
        'Short lowercase club identifier used in resource names and tags.',
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
      description:
        'Operational owner identifier; use club-owned after account migration.',
      allowedPattern: '^[a-z0-9][a-z0-9-]{1,31}$',
      constraintDescription: 'Use 2-32 lowercase letters, digits or hyphens.',
    });

    const googleOAuthClientId = new cdk.CfnParameter(
      this,
      'GoogleOAuthClientId',
      {
        type: 'String',
        default: '000000000000-not-configured.apps.googleusercontent.com',
        description:
          'Google Identity Services web client ID. Replace the locked placeholder before committee use.',
        allowedPattern: '^[0-9]+-[a-z0-9-]+\\.apps\\.googleusercontent\\.com$',
      },
    );

    const committeeAdminEmails = new cdk.CfnParameter(
      this,
      'CommitteeAdminEmails',
      {
        type: 'String',
        default: 'not-configured@example.invalid',
        description:
          'Comma-separated lower-case Google Workspace email allow-list for committee administration.',
        allowedPattern: '^[^,\\s@]+@[^,\\s@]+(?:,[^,\\s@]+@[^,\\s@]+)*$',
      },
    );

    const googleHostedDomain = new cdk.CfnParameter(
      this,
      'GoogleHostedDomain',
      {
        type: 'String',
        default: '',
        description:
          'Optional Google Workspace hosted domain (for example heatherdale.org.au).',
        allowedPattern: '^$|^[a-z0-9.-]+$',
      },
    );

    const emailOtpSender = new cdk.CfnParameter(this, 'EmailOtpSender', {
      type: 'String',
      description: 'Verified SES sender address for convenor email OTP codes.',
      allowedPattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
    });
    const emailOtpSandboxRecipientOne = new cdk.CfnParameter(
      this,
      'EmailOtpSandboxRecipientOne',
      {
        type: 'String',
        description: 'First SES sandbox recipient verified for the pilot.',
        allowedPattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      },
    );
    const emailOtpSandboxRecipientTwo = new cdk.CfnParameter(
      this,
      'EmailOtpSandboxRecipientTwo',
      {
        type: 'String',
        description: 'Second SES sandbox recipient verified for the pilot.',
        allowedPattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      },
    );
    const enableConvenorEmailOtp = new cdk.CfnParameter(
      this,
      'EnableConvenorEmailOtp',
      {
        type: 'String',
        default: 'false',
        allowedValues: ['true', 'false'],
        description:
          'Enable Cognito EMAIL_OTP only after all SES identities are verified.',
      },
    );
    const emailOtpEnabled = new cdk.CfnCondition(
      this,
      'ConvenorEmailOtpEnabled',
      {
        expression: cdk.Fn.conditionEquals(
          enableConvenorEmailOtp.value,
          'true',
        ),
      },
    );

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

    const programmeTable = new dynamodb.Table(this, 'Programmes', {
      tableName: cdk.Fn.join('-', [resourcePrefix, 'programmes']),
      partitionKey: {
        name: 'programmeId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const auditTable = new dynamodb.Table(this, 'AuditEvents', {
      tableName: cdk.Fn.join('-', [resourcePrefix, 'audit-events']),
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'changedAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const assetTable = new dynamodb.Table(this, 'DisplayAssets', {
      tableName: cdk.Fn.join('-', [resourcePrefix, 'display-assets']),
      partitionKey: { name: 'assetId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const contentTable = new dynamodb.Table(this, 'ContentItems', {
      tableName: cdk.Fn.join('-', [resourcePrefix, 'content-items']),
      partitionKey: { name: 'contentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const sessionTable = new dynamodb.Table(this, 'ControlSessions', {
      tableName: cdk.Fn.join('-', [resourcePrefix, 'control-sessions']),
      partitionKey: {
        name: 'sessionHash',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'expiresAt',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const emailOtpSenderIdentity = new ses.CfnEmailIdentity(
      this,
      'EmailOtpSenderIdentity',
      { emailIdentity: emailOtpSender.valueAsString },
    );
    new ses.CfnEmailIdentity(this, 'EmailOtpSandboxRecipientOneIdentity', {
      emailIdentity: emailOtpSandboxRecipientOne.valueAsString,
    });
    new ses.CfnEmailIdentity(this, 'EmailOtpSandboxRecipientTwoIdentity', {
      emailIdentity: emailOtpSandboxRecipientTwo.valueAsString,
    });

    const smsExternalId = cdk.Fn.join('-', [resourcePrefix, 'cognito-sms']);
    const cognitoSmsRole = new iam.Role(this, 'ConvenorSmsRole', {
      assumedBy: new iam.ServicePrincipal('cognito-idp.amazonaws.com', {
        conditions: { StringEquals: { 'sts:ExternalId': smsExternalId } },
      }),
      description: 'Allows the OpenCourt user pool to send one-time SMS codes.',
    });
    const cognitoSmsPolicy = new iam.Policy(this, 'ConvenorSmsPolicy', {
      statements: [
        new iam.PolicyStatement({ actions: ['sns:Publish'], resources: ['*'] }),
      ],
    });
    cognitoSmsPolicy.attachToRole(cognitoSmsRole);
    const convenorPool = new cognito.CfnUserPool(this, 'ConvenorUserPool', {
      userPoolName: cdk.Fn.join('-', [resourcePrefix, 'convenors']),
      adminCreateUserConfig: { allowAdminCreateUserOnly: true },
      autoVerifiedAttributes: ['phone_number'],
      deletionProtection: 'ACTIVE',
      schema: [
        {
          name: 'name',
          attributeDataType: 'String',
          mutable: true,
          required: true,
        },
        {
          name: 'phone_number',
          attributeDataType: 'String',
          mutable: true,
          required: true,
        },
        {
          name: 'email',
          attributeDataType: 'String',
          mutable: true,
          required: false,
        },
      ],
      smsConfiguration: {
        externalId: smsExternalId,
        snsCallerArn: cognitoSmsRole.roleArn,
        snsRegion: this.region,
      },
      userPoolTier: 'ESSENTIALS',
    });
    convenorPool.addResourceDependency(
      cognitoSmsPolicy.node.defaultChild as iam.CfnPolicy,
    );
    convenorPool.addResourceDependency(emailOtpSenderIdentity);
    convenorPool.addPropertyOverride(
      'Policies.SignInPolicy.AllowedFirstAuthFactors',
      cdk.Fn.conditionIf(
        emailOtpEnabled.logicalId,
        ['PASSWORD', 'SMS_OTP', 'EMAIL_OTP'],
        ['PASSWORD', 'SMS_OTP'],
      ),
    );
    convenorPool.addPropertyOverride(
      'EmailConfiguration',
      cdk.Fn.conditionIf(
        emailOtpEnabled.logicalId,
        {
          EmailSendingAccount: 'DEVELOPER',
          From: cdk.Fn.join('', [
            'OpenCourt <',
            emailOtpSender.valueAsString,
            '>',
          ]),
          SourceArn: this.formatArn({
            service: 'ses',
            resource: 'identity',
            resourceName: emailOtpSender.valueAsString,
          }),
        },
        { EmailSendingAccount: 'COGNITO_DEFAULT' },
      ),
    );
    const convenorClient = new cognito.CfnUserPoolClient(
      this,
      'ConvenorUserPoolClient',
      {
        userPoolId: convenorPool.ref,
        clientName: 'opencourt-control-room',
        explicitAuthFlows: ['ALLOW_USER_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
        generateSecret: false,
        preventUserExistenceErrors: 'ENABLED',
        enableTokenRevocation: true,
        refreshTokenValidity: 90,
        tokenValidityUnits: { refreshToken: 'days' },
      },
    );
    const convenorGroup = new cognito.CfnUserPoolGroup(this, 'ConvenorGroup', {
      userPoolId: convenorPool.ref,
      groupName: 'convenors',
      description: 'Competition convenors with display-only access.',
    });

    const websiteBucket = new s3.Bucket(this, 'ControlRoomWebsite', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['content-type', 'x-amz-checksum-sha256'],
          exposedHeaders: ['ETag'],
          maxAge: 300,
        },
      ],
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
      reservedConcurrentExecutions: 10,
      environment: {
        DEVICE_CONFIG_TABLE: table.tableName,
        PROGRAMME_TABLE: programmeTable.tableName,
        AUDIT_TABLE: auditTable.tableName,
        ASSET_TABLE: assetTable.tableName,
        CONTENT_TABLE: contentTable.tableName,
        SESSION_TABLE: sessionTable.tableName,
        ASSET_BUCKET: websiteBucket.bucketName,
        GOOGLE_OAUTH_CLIENT_ID: googleOAuthClientId.valueAsString,
        COMMITTEE_ADMIN_EMAILS: committeeAdminEmails.valueAsString,
        GOOGLE_HOSTED_DOMAIN: googleHostedDomain.valueAsString,
        CONVENOR_USER_POOL_ID: convenorPool.ref,
        CONVENOR_USER_POOL_CLIENT_ID: convenorClient.ref,
        CONVENOR_GROUP: convenorGroup.groupName!,
      },
      bundling: {
        minify: true,
        sourceMap: false,
      },
    });
    controlApi.node.addDependency(table);
    controlApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Scan',
          'dynamodb:UpdateItem',
        ],
        resources: [table.tableArn],
      }),
    );
    controlApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Scan'],
        resources: [programmeTable.tableArn],
      }),
    );
    controlApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Scan'],
        resources: [assetTable.tableArn],
      }),
    );
    contentTable.grant(
      controlApi,
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:Scan',
    );
    sessionTable.grantReadWriteData(controlApi);
    controlApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminDeleteUser',
          'cognito-idp:ListUsers',
        ],
        resources: [convenorPool.attrArn],
      }),
    );
    controlApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [websiteBucket.arnForObjects('display-assets/*')],
      }),
    );
    auditTable.grant(controlApi, 'dynamodb:PutItem');
    controlApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:TransactWriteItems'],
        resources: [table.tableArn, auditTable.tableArn],
      }),
    );

    const functionUrl = controlApi.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [
          lambda.HttpMethod.GET,
          lambda.HttpMethod.POST,
          lambda.HttpMethod.PUT,
          lambda.HttpMethod.DELETE,
        ],
        allowedHeaders: ['if-none-match', 'authorization', 'content-type'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeaders',
      {
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Cross-Origin-Opener-Policy',
              value: 'same-origin-allow-popups',
              override: true,
            },
          ],
        },
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy:
              "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; connect-src 'self' https://accounts.google.com/gsi/ https://cognito-idp.ap-southeast-2.amazonaws.com https://*.lambda-url.ap-southeast-2.on.aws https://*.s3.ap-southeast-2.amazonaws.com; frame-src https://accounts.google.com/gsi/; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
        },
      },
    );

    const distribution = new cloudfront.Distribution(
      this,
      'ControlRoomDistribution',
      {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin:
            cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(
              websiteBucket,
            ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeaders,
        },
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      },
    );
    controlApi.addEnvironment(
      'ASSET_PUBLIC_BASE_URL',
      `https://${distribution.distributionDomainName}`,
    );

    new budgets.CfnBudget(this, 'MonthlyCostGuardrail', {
      budget: {
        budgetName: cdk.Fn.join('-', [
          resourcePrefix,
          'monthly-cost-guardrail',
        ]),
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 10, unit: 'USD' },
        costFilters: {
          Service: [
            'AWS Lambda',
            'Amazon DynamoDB',
            'AmazonCloudWatch',
            'Amazon Simple Storage Service',
            'Amazon CloudFront',
          ],
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
    cdk.Tags.of(this).add(
      'Repository',
      'github.com/cclawton/opencourt-display',
    );

    new cdk.CfnOutput(this, 'DeviceConfigTableName', {
      value: table.tableName,
    });
    new cdk.CfnOutput(this, 'DeviceConfigBaseUrl', { value: functionUrl.url });
    new cdk.CfnOutput(this, 'ProgrammeTableName', {
      value: programmeTable.tableName,
    });
    new cdk.CfnOutput(this, 'AuditTableName', { value: auditTable.tableName });
    new cdk.CfnOutput(this, 'AssetTableName', { value: assetTable.tableName });
    new cdk.CfnOutput(this, 'ContentTableName', {
      value: contentTable.tableName,
    });
    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'ControlRoomUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'ControlRoomDistributionId', {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, 'ConvenorUserPoolId', {
      value: convenorPool.ref,
    });
    new cdk.CfnOutput(this, 'ConvenorUserPoolClientId', {
      value: convenorClient.ref,
    });
    new cdk.CfnOutput(this, 'DeploymentIdentity', {
      value: cdk.Fn.join('/', [
        clubSlug.valueAsString,
        deploymentStage.valueAsString,
        deploymentOwner.valueAsString,
      ]),
    });
  }
}
