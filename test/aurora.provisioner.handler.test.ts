import {
  Callback,
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
  const fetchAndConformSecretsStub = sinon.stub(Methods.prototype, 'fetchAndConformSecrets');
  const createUserStub = sinon.stub(Methods.prototype, 'createUser');
  const conformPasswordStub = sinon.stub(Methods.prototype, 'conformPassword');
  const grantPrivilegesStub = sinon.stub(Methods.prototype, 'grantPrivileges');
  const postgresStub = sinon.stub(Client.prototype, 'query');

  const eventBase: CloudFormationCustomResourceEventCommon = {
    // RequestType: 'Create',
    LogicalResourceId: 'fakeLogicalResourceId',
    RequestId: 'fakeRequestId',
    ResourceType: 'Custom::RdsUser',
    ResponseURL: 'fakeResponseUrl',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      userSecretArn: 'fakeUserSecretArn',
      dbName: 'fakeDbName',
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

  beforeEach(() => {
    fetchAndConformSecretsStub.resetHistory();
    createUserStub.resetHistory();
    conformPasswordStub.resetHistory();
    grantPrivilegesStub.resetHistory();
    postgresStub.resetHistory();
  });

  it.todo('runs onCreate');

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
