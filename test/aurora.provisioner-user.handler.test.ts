import {
  Callback,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEventCommon,
  CloudFormationCustomResourceUpdateEvent,
  Context,
} from 'aws-lambda';
import { Client } from 'pg';
import sinon from 'sinon';

import { Methods, handler } from '../src/aurora.provision-user';

sinon.stub(console, 'log');

const originalEnv = process.env;

const fetchAndConformSecretsStub = sinon.stub(Methods.prototype, 'fetchAndConformSecrets');
const createUserStub = sinon.stub(Methods.prototype, 'createUser');
const conformPasswordStub = sinon.stub(Methods.prototype, 'conformPassword');
const grantRoleStub = sinon.stub(Methods.prototype, 'grantRole');
const postgresStub = sinon.stub(Client.prototype, 'connect');

const standardSecretResult = {
  clientConfig: {
    user: 'fakeManagerUser',
    password: 'fakeManagerPassword',
    host: 'fakeManagerHost',
    port: 666,
  },
  username: 'fakeUsername',
  password: 'fakePassword',
};

beforeEach(() => {
  fetchAndConformSecretsStub.reset();
  createUserStub.reset();
  conformPasswordStub.reset();
  grantRoleStub.reset();
  postgresStub.reset();

  jest.resetModules();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('handler', () => {
  const resourcePropertiesBase = {
    ServiceToken: 'fakeServiceToken',
    userSecretArn: 'fakeUserSecretArn',
    isWriter: true,
    proxyHost: 'fakeProxyHost',
  };

  const eventBase: CloudFormationCustomResourceEventCommon = {
    LogicalResourceId: 'fakeLogicalResourceId',
    RequestId: 'fakeRequestId',
    ResourceType: 'Custom::RdsUser',
    ResponseURL: 'fakeResponseUrl',
    ResourceProperties: resourcePropertiesBase,
    ServiceToken: 'fakeServiceToken',
    StackId: 'fakeStackId',
  };

  const context: Context = {
    awsRequestId: 'fakeAwsRequestId',
    callbackWaitsForEmptyEventLoop: true,
    done: sinon.stub(),
    fail: sinon.stub(),
    functionName: 'fakeFunctionName',
    functionVersion: 'fakeFunctionVersion',
    getRemainingTimeInMillis: () => 0,
    invokedFunctionArn: 'fakeInvokedFunctionArn',
    logGroupName: 'fakeLogGroupName',
    logStreamName: 'fakeLogStreamName',
    memoryLimitInMB: 'fakeMemoryLimitInMB',
    succeed: () => {},
  };

  const callback: Callback = (_err, _data) => {};

  describe('runs onCreate', () => {
    const createEvent: CloudFormationCustomResourceCreateEvent = {
      ...eventBase,
      RequestType: 'Create',
    };
    it('no MANAGER_SECRET_ARN', async () => {
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'none',
        Reason: 'Failed to find MANAGER_SECRET_ARN in environment variables see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from fetchAndConformSecrets', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'none',
        Reason: 'Secrets issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from postgres', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'client.connect failed: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from createUser', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Create / conform issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from conformPassword', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.resolves();
      conformPasswordStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Create / conform issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from grantRole', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.resolves();
      conformPasswordStub.resolves();
      grantRoleStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Create / conform issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('succeeds', async () => {
      const createEvent: CloudFormationCustomResourceCreateEvent = {
        ...eventBase,
        RequestType: 'Create',
        ResourceProperties: {
          ...resourcePropertiesBase,
          databaseName: 'fakeDbName',
        },
      };
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.resolves();
      conformPasswordStub.resolves();
      grantRoleStub.resolves();
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Success see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'SUCCESS',
      });
    });
  });

  describe('runs onUpdate', () => {
    const updateEvent: CloudFormationCustomResourceUpdateEvent = {
      ...eventBase,
      OldResourceProperties: {},
      PhysicalResourceId: 'fakeExistingResourceId',
      RequestType: 'Update',
    };

    it('no MANAGER_SECRET_ARN', async () => {
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'none',
        Reason: 'Failed to find MANAGER_SECRET_ARN in environment variables see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from fetchAndConformSecrets', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'none',
        Reason: 'Secrets issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from postgres', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'client.connect failed: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from createUser', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Create / conform issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from conformPassword', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.resolves();
      conformPasswordStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Create / conform issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from grantRole', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.resolves();
      conformPasswordStub.resolves();
      grantRoleStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Create / conform issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('succeeds', async () => {
      const createEvent: CloudFormationCustomResourceCreateEvent = {
        ...eventBase,
        RequestType: 'Create',
        ResourceProperties: {
          ...resourcePropertiesBase,
          databaseName: 'fakeDbName',
        },
      };
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchAndConformSecretsStub.resolves(standardSecretResult);
      postgresStub.resolves();
      createUserStub.resolves();
      conformPasswordStub.resolves();
      grantRoleStub.resolves();
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeUsername',
        Reason: 'Success see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'SUCCESS',
      });
    });
  });

  it('runs onDelete', async () => {
    const deleteEvent: CloudFormationCustomResourceDeleteEvent = {
      ...eventBase,
      PhysicalResourceId: 'fakeUser',
      RequestType: 'Delete',
    };
    const r = await handler(deleteEvent, context, callback);
    expect(r).toEqual({
      LogicalResourceId: 'fakeLogicalResourceId',
      PhysicalResourceId: 'fakeUser',
      Reason: 'See CloudWatch Log Stream: fakeLogStreamName',
      RequestId: 'fakeRequestId',
      StackId: 'fakeStackId',
      Status: 'SUCCESS',
    });
  });
});
