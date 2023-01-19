import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { InstanceClass, InstanceType, InstanceSize, IVpc, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
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
      vpc = new Vpc(stack, 'Vpc');
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
    it('databaseName', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        DatabaseName: Match.absent(), // we manage database creation via the custom resources
      });
      template.hasResourceProperties('Custom::AuroraDatabase', { databaseName });
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

    // it('outputs ProxyEndpoint', () => {
    //   template.hasOutput('ProxyEndpoint', {});
    // });
  });
  describe('options', () => {
    beforeEach(() => {
      app = new App();
      stack = new Stack(app, 'test');
      kmsKey = new Key(stack, 'Key');
      vpc = new Vpc(stack, 'Vpc');
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
      const securityGroups = [
        new SecurityGroup(stack, 'SecurityGroup', {
          vpc,
          description,
          allowAllOutbound: true,
        }),
      ];
      createAurora({ ...defaultAuroraProps, securityGroups });
      template.hasResourceProperties('AWS::EC2::SecurityGroup', { GroupDescription: description });
    });
    it.todo('skipProvisionDatabase');
    it('skipAddRotationMultiUser', () => {
      createAurora({ ...defaultAuroraProps, skipAddRotationMultiUser: true });
      ['AWS::SecretsManager::Secret'].forEach((r) => template.resourceCountIs(r, 3)); // Still have 3 users
      ['AWS::SecretsManager::RotationSchedule'].forEach((r) => template.resourceCountIs(r, 1)); // Only manager is rotated
    });
    it('skipProxy', () => {
      createAurora({ ...defaultAuroraProps, skipProxy: true });
      template.resourceCountIs('AWS::RDS::DBProxy', 0);
    });
    it('skipUserProvisioning', () => {
      createAurora({ ...defaultAuroraProps, skipUserProvisioning: true });
      template.resourceCountIs('Custom::RdsUser', 0);
    });
  });
});
