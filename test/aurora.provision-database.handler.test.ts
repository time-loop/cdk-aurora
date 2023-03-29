import {
  Callback,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEventCommon,
  CloudFormationCustomResourceUpdateEvent,
  Context,
} from 'aws-lambda';
import sinon from 'sinon';

import { Methods, handler } from '../src/aurora.provision-database';

sinon.stub(console, 'log');

const originalEnv = process.env;

const fetchSecretStub = sinon.stub(Methods.prototype, 'fetchSecret');
const createRoleStub = sinon.stub(Methods.prototype, 'createRole');
const createDatabaseStub = sinon.stub(Methods.prototype, 'createDatabase');
const createSchemaStub = sinon.stub(Methods.prototype, 'createSchema');
const configureRoleStub = sinon.stub(Methods.prototype, 'configureRole');
const connectStub = sinon.stub(Methods.prototype, 'connect');

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
  fetchSecretStub.reset();
  createRoleStub.reset();
  createDatabaseStub.reset();
  createSchemaStub.reset();
  configureRoleStub.reset();
  connectStub.reset();

  jest.resetModules();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('handler', () => {
  const resourcePropertiesBase = {
    ServiceToken: 'fakeServiceToken',
    databaseName: 'fakeDbName',
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

    it('fails when no MANAGER_SECRET_ARN', async () => {
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Failed to find MANAGER_SECRET_ARN in environment variables see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from fetchSecret', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Secrets issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error on initial connect to postgres', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'connect failed: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from createDatabase', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Create database issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from createRole', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.resolves();
      createRoleStub.rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Create role issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from postgres re-connect', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.resolves();
      createRoleStub.resolves();
      connectStub.onSecondCall().rejects(new Error('whoopsie'));
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'connect failed: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it.todo('figure out catching errors from createSchema');
    // it('handles error from createSchema', async () => {
    //   process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
    //   fetchSecretStub.resolves(standardSecretResult);
    //   postgresStub.resolves();
    //   createRoleStub.resolves();
    //   createDatabaseStub.resolves();
    //   createRoleStub.resolves();
    //   createSchemaStub.rejects(new Error('whoopsie'));
    //   const r = await handler(createEvent, context, callback);
    //   expect(r).toEqual({
    //     LogicalResourceId: 'fakeLogicalResourceId',
    //     PhysicalResourceId: 'fakeDbName',
    //     Reason: 'Create schema issue: Error: whoopsie see also fakeLogStreamName',
    //     RequestId: 'fakeRequestId',
    //     StackId: 'fakeStackId',
    //     Status: 'FAILED',
    //   });
    // });

    it.todo('figure out catching errors from createSchema');
    // it('handles error from createSchema', async () => {
    //   process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
    //   fetchSecretStub.resolves(standardSecretResult);
    //   postgresStub.resolves();
    //   createRoleStub.resolves();
    //   createDatabaseStub.resolves();
    //   createRoleStub.resolves();
    //   createSchemaStub.resolves();
    //   configureRoleStub.rejects(new Error('whoopsie'));
    //   const r = await handler(createEvent, context, callback);
    //   expect(r).toEqual({
    //     LogicalResourceId: 'fakeLogicalResourceId',
    //     PhysicalResourceId: 'fakeDbName',
    //     Reason: 'Configure role issue: Error: whoopsie see also fakeLogStreamName',
    //     RequestId: 'fakeRequestId',
    //     StackId: 'fakeStackId',
    //     Status: 'FAILED',
    //   });
    // });

    it('succeeds', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.resolves();
      createRoleStub.resolves();
      createDatabaseStub.resolves();
      createRoleStub.resolves();
      createSchemaStub.resolves();
      configureRoleStub.resolves();
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
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

    it('fails when no MANAGER_SECRET_ARN', async () => {
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Failed to find MANAGER_SECRET_ARN in environment variables see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from fetchSecret', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Secrets issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error on initial connect to postgres', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'connect failed: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from createDatabase', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Create database issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from createRole', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.resolves();
      createRoleStub.rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'Create role issue: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    it('handles error from postgres re-connect', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.resolves();
      createRoleStub.resolves();
      connectStub.onSecondCall().rejects(new Error('whoopsie'));
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
        Reason: 'connect failed: Error: whoopsie see also fakeLogStreamName',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    // it('handles error from createSchema', async () => {
    //   process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
    //   fetchSecretStub.resolves(standardSecretResult);
    //   postgresStub.onFirstCall().resolves();
    //   createRoleStub.resolves();
    //   createDatabaseStub.resolves();
    //   createRoleStub.resolves();
    //   createSchemaStub.rejects(new Error('whoopsie'));
    //   const r = await handler(updateEvent, context, callback);
    //   expect(r).toEqual({
    //     LogicalResourceId: 'fakeLogicalResourceId',
    //     PhysicalResourceId: 'fakeDbName',
    //     Reason: 'Create schema issue: Error: whoopsie see also fakeLogStreamName',
    //     RequestId: 'fakeRequestId',
    //     StackId: 'fakeStackId',
    //     Status: 'FAILED',
    //   });
    // });

    // it('handles error from createSchema', async () => {
    //   process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
    //   fetchSecretStub.resolves(standardSecretResult);
    //   postgresStub.onFirstCall().resolves();
    //   createRoleStub.resolves();
    //   createDatabaseStub.resolves();
    //   createRoleStub.resolves();
    //   createSchemaStub.resolves();
    //   configureRoleStub.rejects(new Error('whoopsie'));
    //   const r = await handler(updateEvent, context, callback);
    //   expect(r).toEqual({
    //     LogicalResourceId: 'fakeLogicalResourceId',
    //     PhysicalResourceId: 'fakeDbName',
    //     Reason: 'Configure role issue: Error: whoopsie see also fakeLogStreamName',
    //     RequestId: 'fakeRequestId',
    //     StackId: 'fakeStackId',
    //     Status: 'FAILED',
    //   });
    // });

    it('succeeds', async () => {
      process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
      fetchSecretStub.resolves(standardSecretResult);
      connectStub.onFirstCall().resolves();
      createRoleStub.resolves();
      createDatabaseStub.resolves();
      createRoleStub.resolves();
      createSchemaStub.resolves();
      configureRoleStub.resolves();
      const r = await handler(updateEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'fakeDbName',
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
