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

import { Methods, handler } from '../src/aurora.provisioner';

sinon.stub(console, 'log');

describe('handler', () => {
  const eventBase: CloudFormationCustomResourceEventCommon = {
    LogicalResourceId: 'fakeLogicalResourceId',
    RequestId: 'fakeRequestId',
    ResourceType: 'Custom::RdsUser',
    ResponseURL: 'fakeResponseUrl',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      userSecretArn: 'fakeUserSecretArn',
      // dbName: 'fakeDbName',
      isWriter: true,
    },
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
    const originalEnv = process.env;

    const fetchAndConformSecretsStub = sinon.stub(Methods.prototype, 'fetchAndConformSecrets');
    const createUserStub = sinon.stub(Methods.prototype, 'createUser');
    const conformPasswordStub = sinon.stub(Methods.prototype, 'conformPassword');
    const grantPrivilegesStub = sinon.stub(Methods.prototype, 'grantPrivileges');
    const postgresStub = sinon.stub(Client.prototype, 'connect');

    beforeEach(() => {
      fetchAndConformSecretsStub.resetHistory();
      createUserStub.resetHistory();
      conformPasswordStub.resetHistory();
      grantPrivilegesStub.resetHistory();
      postgresStub.resetHistory();

      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('no MANAGER_SECRET_ARN', async () => {
      const createEvent: CloudFormationCustomResourceCreateEvent = {
        ...eventBase,
        RequestType: 'Create',
      };
      const r = await handler(createEvent, context, callback);
      expect(r).toEqual({
        LogicalResourceId: 'fakeLogicalResourceId',
        PhysicalResourceId: 'none',
        Reason: 'Failed to find MANAGER_SECRET_ARN in environment variables see also fakeLogStreamName',
        ReasonPrefix: 'Failed to find MANAGER_SECRET_ARN in environment variables',
        RequestId: 'fakeRequestId',
        StackId: 'fakeStackId',
        Status: 'FAILED',
      });
    });

    // it('no dbName set, skip grants', async () => {
    //   const createEvent: CloudFormationCustomResourceCreateEvent = {
    //     ...eventBase,
    //     RequestType: 'Create',
    //   };
    //   process.env.MANAGER_SECRET_ARN = 'fakeManagerSecretArn';
    //   fetchAndConformSecretsStub.resolves({
    //     clientConfig: {
    //       user: 'fakeManagerUser',
    //       password: 'fakeManagerPassword',
    //       host: 'fakeManagerHost',
    //       port: 666,
    //     },
    //     username: 'fakeUsername',
    //     password: 'fakePassword',
    //   });
    //   postgresStub.resolves();
    //   createUserStub.resolves();
    //   conformPasswordStub.resolves();
    //   const r = await handler(createEvent, context, callback);
    //   expect(r).toEqual({
    //     LogicalResourceId: 'fakeLogicalResourceId',
    //     PhysicalResourceId: 'fakeUsername',
    //     Reason: 'Failed to find MANAGER_SECRET_ARN in environment variables see also fakeLogStreamName',
    //     ReasonPrefix: 'Failed to find MANAGER_SECRET_ARN in environment variables',
    //     RequestId: 'fakeRequestId',
    //     StackId: 'fakeStackId',
    //     Status: 'FAILED',
    //   });
    // });
  });

  it('runs onUpdate', async () => {
    const updateEvent: CloudFormationCustomResourceUpdateEvent = {
      ...eventBase,
      PhysicalResourceId: 'fakeUser',
      RequestType: 'Update',
      OldResourceProperties: {},
    };
    const r = await handler(updateEvent, context, callback);
    expect(r).toEqual({
      LogicalResourceId: 'fakeLogicalResourceId',
      PhysicalResourceId: 'fakeUser',
      Reason: 'See CloudWatch Log Stream: fakeLogStreamName',
      RequestId: 'fakeRequestId',
      StackId: 'fakeStackId',
      Status: 'SUCCESS',
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
