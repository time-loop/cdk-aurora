import { App, assertions, aws_kms, aws_ec2, Stack, Duration } from 'aws-cdk-lib';
import { Namer } from 'multi-convention-namer';

import { Aurora } from '../src';

describe('Aurora', () => {
  describe('default', () => {
    const app = new App();
    const stack = new Stack(app, 'test');
    const kmsKey = new aws_kms.Key(stack, 'Key');
    const vpc = new aws_ec2.Vpc(stack, 'Vpc');
    new Aurora(stack, new Namer(['test']), { kmsKey, vpc });
    const template = assertions.Template.fromStack(stack);
    it('creates resources', () => {
      ['AWS::RDS::DBCluster', 'AWS::RDS::DBProxy'].forEach((r) => template.resourceCountIs(r, 1));
      ['AWS::RDS::DBInstance'].forEach((r) => template.resourceCountIs(r, 2));
      ['AWS::SecretsManager::RotationSchedule', 'AWS::SecretsManager::Secret'].forEach((r) =>
        template.resourceCountIs(r, 3),
      );
    });
    it('retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 1,
      });
    });

    // it('outputs ProxyEndpoint', () => {
    //   template.hasOutput('ProxyEndpoint', {});
    // });
  });
  describe('options', () => {
    it('bootstrap', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { kmsKey, vpc, bootstrap: true });
      const template = assertions.Template.fromStack(stack);
      ['AWS::SecretsManager::Secret'].forEach((r) => template.resourceCountIs(r, 3)); // Still have 3 users
      ['AWS::SecretsManager::RotationSchedule'].forEach((r) => template.resourceCountIs(r, 1)); // Only manager is rotated
    });
    it('defaultDatabaseName', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { kmsKey, vpc, defaultDatabaseName: 'foo' });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        DatabaseName: 'foo',
      });
    });
    it('instances', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), {
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
        instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.R6G, aws_ec2.InstanceSize.XLARGE24),
        kmsKey,
        vpc,
      });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.r6g.24xlarge',
      });
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
      new Aurora(stack, new Namer(['test']), { kmsKey, vpc, retention: Duration.days(30) });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 30,
      });
    });
    it('skipProxy', () => {
      const app = new App();
      const stack = new Stack(app, 'test');
      const kmsKey = new aws_kms.Key(stack, 'Key');
      const vpc = new aws_ec2.Vpc(stack, 'Vpc');
      new Aurora(stack, new Namer(['test']), { kmsKey, vpc, skipProxy: true });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('AWS::RDS::DBProxy', 0);
    });
  });
});
