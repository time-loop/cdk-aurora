import { App, assertions, aws_kms, aws_ec2, Stack, Duration } from 'aws-cdk-lib';
import { Namer } from 'multi-convention-namer';

import { Aurora } from '../src';

const databaseName = 'fakeDbName';

describe('Aurora', () => {
  describe('default', () => {
    const app = new App();
    const stack = new Stack(app, 'test');
    const kmsKey = new aws_kms.Key(stack, 'Key');
    const vpc = new aws_ec2.Vpc(stack, 'Vpc');
    new Aurora(stack, new Namer(['test']), { databaseName, kmsKey, vpc });
    const template = assertions.Template.fromStack(stack);
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
        DatabaseName: assertions.Match.absent(), // we manage database creation via the custom resources
      });
      template.hasResourceProperties('Custom::AuroraDatabase', {
        databaseName,
      });
    });
    it('proxyName', () => {
      template.hasResourceProperties('AWS::RDS::DBProxy', { DBProxyName: 'Test' });
    });
    it('retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 1,
      });
    });
    it('provisions reader and writer', () => {
      template.hasResourceProperties('Custom::AuroraUser', {
        isWriter: false,
      });
      template.hasResourceProperties('Custom::AuroraUser', {
        isWriter: true,
      });
    });
    it('uses t4g.medium', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t4g.medium',
      });
    });

    // it('outputs ProxyEndpoint', () => {
    //   template.hasOutput('ProxyEndpoint', {});
    // });
  });
  describe('options', () => {
    it('activityStream', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      const a = new Aurora(stack, new Namer(['test']), { databaseName, kmsKey, vpc, activityStream: true });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('AWS::Lambda::Function', 10);
      template.resourceCountIs('Custom::AuroraActivityStream', 1);
      expect(a.activityStreamArn).not.toBeFalsy();
    });
    it('instances', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), {
        databaseName,
        instances: 12,
        kmsKey,
        vpc,
      });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('AWS::RDS::DBInstance', 12);
    });
    it('instanceType', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), {
        databaseName,
        instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.R6G, aws_ec2.InstanceSize.XLARGE24),
        kmsKey,
        vpc,
      });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.r6g.24xlarge',
      });
    });
    it('instanceType warns when not Graviton', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), {
        databaseName,
        instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.R5, aws_ec2.InstanceSize.XLARGE24),
        kmsKey,
        vpc,
      });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.r5.24xlarge',
      });
      const annotation = assertions.Annotations.fromStack(stack);
      annotation.hasWarning('*', assertions.Match.stringLikeRegexp('is not ARM64'));
    });
    // I don't see how to test things that are outside the "Properties" block.
    // it('removalPolicy', () => {
    //   const app = new App();
    //   const stack = new Stack(app, 'test');
    //   const kmsKey = new aws_kms.Key(stack, 'Key');
    //   const vpc = new aws_ec2.Vpc(stack, 'Vpc');
    //   new Aurora(stack, new Namer(['test']), {
    //     kmsKey,
    //     removalPolicy: RemovalPolicy.SNAPSHOT,
    //     vpc,
    //   });
    //   const template = assertions.Template.fromStack(stack);
    //   template.hasResourceProperties('AWS::RDS::DBCluster', {
    //     UpdateReplacePolicy: 'Snapshot',
    //     DeletionPolicy: 'Snapshot',
    //   });
    // });
    it('retention', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { databaseName, kmsKey, vpc, retention: Duration.days(30) });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 30,
      });
    });
    it('securityGroup', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      const description = 'Test security group';
      const securityGroup = new aws_ec2.SecurityGroup(stack, 'SecurityGroup', {
        vpc,
        description,
        allowAllOutbound: true,
      });
      new Aurora(stack, new Namer(['test']), {
        databaseName,
        securityGroup,
        kmsKey,
        vpc,
      });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: description,
      });
    });
    it.todo('skipProvisionDatabase');
    it('skipAddRotationMultiUser', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { databaseName, kmsKey, vpc, skipAddRotationMultiUser: true });
      const template = assertions.Template.fromStack(stack);
      ['AWS::SecretsManager::Secret'].forEach((r) => template.resourceCountIs(r, 3)); // Still have 3 users
      ['AWS::SecretsManager::RotationSchedule'].forEach((r) => template.resourceCountIs(r, 1)); // Only manager is rotated
    });
    it('skipProxy', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { databaseName, kmsKey, vpc, skipProxy: true });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('AWS::RDS::DBProxy', 0);
    });
    it('skipUserProvisioning', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { databaseName, kmsKey, vpc, skipUserProvisioning: true });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('Custom::RdsUser', 0);
    });
  });
});
