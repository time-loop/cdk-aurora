import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Annotations, Capture, Match, Template } from 'aws-cdk-lib/assertions';
import {
  CfnSecurityGroup,
  CfnSubnet,
  InstanceClass,
  InstanceType,
  InstanceSize,
  IVpc,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { CfnKey, IKey, Key } from 'aws-cdk-lib/aws-kms';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { AuroraPostgresEngineVersion, PerformanceInsightRetention } from 'aws-cdk-lib/aws-rds';
import { Namer } from 'multi-convention-namer';

import { Aurora, AuroraProps } from '../src';

const databaseName = 'fakeDbName';

let app: App;
let stack: Stack;
let kmsKey: IKey;
let vpc: IVpc;
let template: Template;
let defaultAuroraProps: AuroraProps;
let aurora: Aurora;

const createAurora = function (props?: AuroraProps) {
  aurora = new Aurora(stack, new Namer(['test']), {
    ...defaultAuroraProps,
    ...props,
  });
  template = Template.fromStack(stack);
};

describe('Aurora', () => {
  describe('default', () => {
    beforeAll(() => {
      app = new App();
      stack = new Stack(app, 'test');
      kmsKey = new Key(stack, 'Key');
      vpc = new Vpc(stack, 'TestVpc', {
        subnetConfiguration: [
          {
            name: 'ingress',
            subnetType: SubnetType.PUBLIC,
          },
          {
            name: 'application',
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            name: 'rds',
            subnetType: SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
      defaultAuroraProps = { databaseName, kmsKey, vpc };
      createAurora();
    });
    it('creates resources', () => {
      ['AWS::RDS::DBCluster', 'AWS::RDS::DBProxy'].forEach((r) => template.resourceCountIs(r, 1));
      ['AWS::RDS::DBInstance'].forEach((r) => template.resourceCountIs(r, 2));
      ['AWS::SecretsManager::RotationSchedule', 'AWS::SecretsManager::Secret'].forEach((r) =>
        template.resourceCountIs(r, 3),
      );
      template.resourceCountIs('AWS::Lambda::Function', 5);
    });
    describe('cloudwatch logs', () => {
      it('exports', () => {
        template.hasResourceProperties('AWS::RDS::DBCluster', {
          EnableCloudwatchLogsExports: ['postgresql'],
        });
      });
      it('retention', () => {
        template.hasResourceProperties('Custom::LogRetention', {
          // TODO: would be nice to have a ref confirming that this applies to the correct log group
          RetentionInDays: 30,
        });
      });
    });

    it('databaseName', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        DatabaseName: Match.absent(), // we manage database creation via the custom resources
      });
      template.hasResourceProperties('Custom::AuroraDatabase', { databaseName });
    });
    it('performanceInsights', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PerformanceInsightsKMSKeyId: { 'Fn::GetAtt': [stack.getLogicalId(kmsKey.node.defaultChild as CfnKey), 'Arn'] },
        EnablePerformanceInsights: true,
      });
    });

    it('proxyName', () => {
      template.hasResourceProperties('AWS::RDS::DBProxy', { DBProxyName: 'Test' });
    });
    it('removalPolicy', () => {
      template.hasResource('AWS::RDS::DBCluster', {
        UpdateReplacePolicy: 'Snapshot',
        DeletionPolicy: 'Snapshot',
      });
    });
    it('retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', { BackupRetentionPeriod: 1 });
    });
    it('provisions reader and writer', () => {
      template.hasResourceProperties('Custom::AuroraUser', { isWriter: false });
      template.hasResourceProperties('Custom::AuroraUser', { isWriter: true });
    });
    it('uses t4g.medium', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', { DBInstanceClass: 'db.t4g.medium' });
    });
    it('defaults to no prefix on secret names', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'TestManager' });
    });
    // it('outputs ProxyEndpoint', () => {
    //   template.hasOutput('ProxyEndpoint', {});
    // });
    it('vpcSubnets default to PRIVATE_WITH_EGRESS', () => {
      const allVpcNodes = stack.node.findChild('TestVpc').node.findAll();
      const rdsSubnets = allVpcNodes
        .filter((n) => n.node.defaultChild instanceof CfnSubnet)
        .map((n) => n.node.defaultChild as CfnSubnet)
        .filter((s) => {
          const tags = s.tags?.tagValues();
          return tags && tags['aws-cdk:subnet-name'] === 'application'; // the default subnet selection is PRIVATE_WITH_EGRESS
        });
      rdsSubnets.forEach((subnet) =>
        template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {
          SubnetIds: Match.arrayWith([{ Ref: stack.getLogicalId(subnet) }]),
        }),
      );
    });
  });

  describe('options', () => {
    beforeEach(() => {
      app = new App();
      stack = new Stack(app, 'test');
      kmsKey = new Key(stack, 'Key');
      vpc = new Vpc(stack, 'TestVpc', {
        subnetConfiguration: [
          {
            name: 'ingress',
            subnetType: SubnetType.PUBLIC,
          },
          {
            name: 'application',
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            name: 'rds',
            subnetType: SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });
      defaultAuroraProps = { databaseName, kmsKey, vpc };
    });

    it('activityStream', () => {
      const postgresEngineVersion = AuroraPostgresEngineVersion.VER_11_16;
      createAurora({ ...defaultAuroraProps, activityStream: true, postgresEngineVersion });
      template.resourceCountIs('AWS::Lambda::Function', 10);
      template.resourceCountIs('Custom::AuroraActivityStream', 1);
      expect(aurora.activityStreamArn).not.toBeFalsy();
    });
    it('instances', () => {
      createAurora({ ...defaultAuroraProps, instances: 12 });
      template.resourceCountIs('AWS::RDS::DBInstance', 12);
    });
    it('instanceType', () => {
      createAurora({ ...defaultAuroraProps, instanceType: InstanceType.of(InstanceClass.R6G, InstanceSize.XLARGE24) });
      template.hasResourceProperties('AWS::RDS::DBInstance', { DBInstanceClass: 'db.r6g.24xlarge' });
    });
    it('instanceType warns when not Graviton', () => {
      createAurora({ ...defaultAuroraProps, instanceType: InstanceType.of(InstanceClass.R5, InstanceSize.XLARGE24) });
      template.hasResourceProperties('AWS::RDS::DBInstance', { DBInstanceClass: 'db.r5.24xlarge' });
      const annotation = Annotations.fromStack(stack);
      annotation.hasWarning('*', Match.stringLikeRegexp('is not ARM64'));
    });
    it('lambdaLogRetention', () => {
      const lambdaLogRetention = RetentionDays.ONE_WEEK;
      createAurora({ ...defaultAuroraProps, lambdaLogRetention });

      // Find our provisioning lambdas
      const lambdas = template.findResources('AWS::Lambda::Function', {
        Environment: { MANAGER_SECRET_ARN: { Ref: Match.anyValue() } }, // this identifies our provisioning lambdas
      });

      // Every provisioning lambda should have a log retention associated with it, with a matching log group name
      Object.keys(lambdas).forEach((k) => {
        template.hasResourceProperties('Custom::LogRetention', {
          RetentionInDays: lambdaLogRetention,
          LogGroupName: {
            'Fn::Join': Match.arrayEquals(['', Match.arrayWith(['/aws/lambda/', { Ref: k }])]),
          },
        });
      });
    });
    describe('performanceInsightRetention', () => {
      it('LONG_TERM', () => {
        createAurora({ ...defaultAuroraProps, performanceInsightRetention: PerformanceInsightRetention.LONG_TERM });
        template.hasResourceProperties('AWS::RDS::DBInstance', {
          PerformanceInsightsRetentionPeriod: PerformanceInsightRetention.LONG_TERM,
        });
      });
    });
    it('proxySecurityGroups', () => {
      const description = 'Test security group';
      const sg = new SecurityGroup(stack, 'MySecurityGroup', {
        vpc,
        description,
        allowAllOutbound: true,
      });
      createAurora({ ...defaultAuroraProps, proxySecurityGroups: [sg] });
      const actualSg = new Capture();
      template.hasResourceProperties('AWS::RDS::DBProxy', {
        VpcSecurityGroupIds: actualSg,
      });
      expect(actualSg.asArray()).toStrictEqual([
        {
          'Fn::GetAtt': [stack.getLogicalId(sg.node.defaultChild as CfnSecurityGroup), 'GroupId'],
        },
      ]);
      expect(aurora.proxySecurityGroups).toStrictEqual([sg]);
    });
    it('removalPolicy', () => {
      createAurora({ ...defaultAuroraProps, removalPolicy: RemovalPolicy.DESTROY });
      template.hasResource('AWS::RDS::DBCluster', {
        UpdateReplacePolicy: 'Delete',
        DeletionPolicy: 'Delete',
      });
    });
    it('retention', () => {
      createAurora({ ...defaultAuroraProps, retention: Duration.days(30) });
      template.hasResourceProperties('AWS::RDS::DBCluster', { BackupRetentionPeriod: 30 });
    });
    it('securityGroups', () => {
      const description = 'Test security group';
      const sg = new SecurityGroup(stack, 'MySecurityGroup', {
        vpc,
        description,
        allowAllOutbound: true,
      });
      createAurora({ ...defaultAuroraProps, securityGroups: [sg] });
      const actualSg = new Capture();
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        VpcSecurityGroupIds: actualSg,
      });
      expect(actualSg.asArray()).toStrictEqual([
        {
          'Fn::GetAtt': [stack.getLogicalId(sg.node.defaultChild as CfnSecurityGroup), 'GroupId'],
        },
      ]);
      expect(aurora.securityGroups).toStrictEqual([sg]);
    });
    describe('secretPrefix', () => {
      it('string', () => {
        createAurora({ ...defaultAuroraProps, secretPrefix: 'foo' });
        template.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'FooTestManager' });
      });
      it('Namer', () => {
        createAurora({ ...defaultAuroraProps, secretPrefix: new Namer(['yabba', 'dabba', 'do']) });
        template.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'YabbaDabbaDoTestManager' });
      });
    });
    it('skipManagerRotation', () => {
      createAurora({ ...defaultAuroraProps, skipManagerRotation: true });
      ['AWS::SecretsManager::Secret'].forEach((r) => template.resourceCountIs(r, 3)); // Still have 3 users
      ['AWS::SecretsManager::RotationSchedule'].forEach((r) => template.resourceCountIs(r, 2)); // Only read/write users are rotated
    });
    it('skipAddRotationMultiUser', () => {
      createAurora({ ...defaultAuroraProps, skipAddRotationMultiUser: true });
      ['AWS::SecretsManager::Secret'].forEach((r) => template.resourceCountIs(r, 3)); // Still have 3 users
      ['AWS::SecretsManager::RotationSchedule'].forEach((r) => template.resourceCountIs(r, 1)); // Only manager is rotated
    });
    it('passwordRotationIntervalInDays', () => {
      createAurora({ ...defaultAuroraProps, commonRotationUserOptions: { automaticallyAfter: Duration.days(10) } });
      template.hasResourceProperties('AWS::SecretsManager::RotationSchedule', {
        RotationRules: { AutomaticallyAfterDays: 10 },
      });
    });
    it('skipProvisionDatabase', () => {
      createAurora({ ...defaultAuroraProps, skipProvisionDatabase: true });
      template.resourceCountIs('Custom::AuroraDatabase', 0);
      template.resourceCountIs('Custom::AuroraUser', 0); // Implicitly skip user provisioning
    });
    it('skipProxy', () => {
      createAurora({ ...defaultAuroraProps, skipProxy: true });
      template.resourceCountIs('AWS::RDS::DBProxy', 0);
    });
    it('skipUserProvisioning', () => {
      createAurora({ ...defaultAuroraProps, skipUserProvisioning: true });
      template.resourceCountIs('Custom::RdsUser', 0);
    });
    it('vpcSubnets', () => {
      createAurora({ ...defaultAuroraProps, vpcSubnets: { subnetGroupName: 'rds' } });
      // THEN
      const allVpcNodes = stack.node.findChild('TestVpc').node.findAll();
      const rdsSubnets = allVpcNodes
        .filter((n) => n.node.defaultChild instanceof CfnSubnet)
        .map((n) => n.node.defaultChild as CfnSubnet)
        .filter((s) => {
          const tags = s.tags?.tagValues();
          return tags && tags['aws-cdk:subnet-name'] === 'rds';
        });
      rdsSubnets.forEach((subnet) =>
        template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {
          SubnetIds: Match.arrayWith([{ Ref: stack.getLogicalId(subnet) }]),
        }),
      );
    });
  });
});
