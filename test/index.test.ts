import { App, assertions, aws_kms, aws_ec2 } from 'aws-cdk-lib';
import { Namer } from 'multi-convention-namer';

import { core, aurora } from '../../src';

// Minimum props required by @time-loop/cdk-library/core.StackProps
const commonProps = {
  businessUnit: core.BusinessUnit.PRODUCT,
  clickUpEnvironment: core.ClickUpEnvironment.PRODUCTION,
  clickUpRole: core.ClickUpRole.APP,
  confidentiality: core.Confidentiality.PUBLIC,
  namedEnv: core.Environment.usDev('us-west-2'),
};
const name = new Namer(['test']);

describe('Aurora', () => {
  describe('dev default', () => {
    const app = new App();
    const stack = new core.Stack(app, name, commonProps);
    const kmsKey = new aws_kms.Key(stack, 'Key');
    new aurora.Aurora(stack, new Namer(['test']), { kmsKey });
    const template = assertions.Template.fromStack(stack);
    it('creates resources', () => {
      ['AWS::RDS::DBCluster', 'AWS::RDS::DBInstance', 'AWS::RDS::DBProxy'].forEach((r) =>
        template.resourceCountIs(r, 1),
      );
      ['AWS::SecretsManager::RotationSchedule', 'AWS::SecretsManager::Secret'].forEach((r) =>
        template.resourceCountIs(r, 3),
      );
    });
    it('retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 2,
      });
    });

    // it('outputs ProxyEndpoint', () => {
    //   template.hasOutput('ProxyEndpoint', {});
    // });
  });
  describe('staging defaults', () => {
    const app = new App();
    const stack = new core.Stack(app, name, { ...commonProps, namedEnv: core.Environment.usStaging('us-west-2') });
    const kmsKey = new aws_kms.Key(stack, 'Key');
    new aurora.Aurora(stack, new Namer(['test']), { kmsKey });
    const template = assertions.Template.fromStack(stack);
    it('retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 7,
      });
    });
  });
  describe('production defaults', () => {
    const app = new App();
    const stack = new core.Stack(app, name, { ...commonProps, namedEnv: core.Environment.euProd('eu-central-1') });
    const kmsKey = new aws_kms.Key(stack, 'Key');
    new aurora.Aurora(stack, new Namer(['test']), { kmsKey });
    const template = assertions.Template.fromStack(stack);
    it('retention', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        BackupRetentionPeriod: 30,
      });
    });
  });
  describe('options', () => {
    it('bootstrap', () => {
      const app = new App();
      const stack = new core.Stack(app, name, commonProps);
      const kmsKey = new aws_kms.Key(stack, 'Key');
      new aurora.Aurora(stack, new Namer(['test']), { kmsKey, bootstrap: true });
      const template = assertions.Template.fromStack(stack);
      ['AWS::SecretsManager::Secret'].forEach((r) => template.resourceCountIs(r, 3)); // Still have 3 users
      ['AWS::SecretsManager::RotationSchedule'].forEach((r) => template.resourceCountIs(r, 1)); // Only manager is rotated
    });
    it('defaultDatabaseName', () => {
      const app = new App();
      const stack = new core.Stack(app, name, commonProps);
      const kmsKey = new aws_kms.Key(stack, 'Key');
      new aurora.Aurora(stack, new Namer(['test']), { kmsKey, defaultDatabaseName: 'foo' });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        DatabaseName: 'foo',
      });
    });
    it('instanceType', () => {
      const app = new App();
      const stack = new core.Stack(app, name, commonProps);
      const kmsKey = new aws_kms.Key(stack, 'Key');
      new aurora.Aurora(stack, new Namer(['test']), {
        kmsKey,
        instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.R6G, aws_ec2.InstanceSize.XLARGE24),
      });
      const template = assertions.Template.fromStack(stack);
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.r6g.24xlarge',
      });
    });
    it('skipProxy', () => {
      const app = new App();
      const stack = new core.Stack(app, name, commonProps);
      const kmsKey = new aws_kms.Key(stack, 'Key');
      new aurora.Aurora(stack, new Namer(['test']), { kmsKey, skipProxy: true });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('AWS::RDS::DBProxy', 0);
    });
    it('users', () => {
      const app = new App();
      const stack = new core.Stack(app, name, commonProps);
      const kmsKey = new aws_kms.Key(stack, 'Key');
      new aurora.Aurora(stack, new Namer(['test']), {
        kmsKey,
        users: ['one', 'two', 'three', 'four'].map((u) => {
          return {
            name: new Namer([u]),
          };
        }),
      });
      const template = assertions.Template.fromStack(stack);
      template.resourceCountIs('AWS::SecretsManager::Secret', 5); // 4 users + 1 manager
    });
  });
});
