import {
  Callback,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEventCommon,
  CloudFormationCustomResourceUpdateEvent,
  Context,
} from 'aws-lambda';
import sinon from 'sinon';

import { Methods, OnEvent } from '../src/aurora.activity-stream';

sinon.stub(console, 'log');

const onCreateStub = sinon.stub(Methods.prototype, 'onCreate');
const onUpdateStub = sinon.stub(Methods.prototype, 'onUpdate');
const onDeleteStub = sinon.stub(Methods.prototype, 'onDelete');

const resourcePropertiesBase = {
  ServiceToken: 'fakeServiceToken',
  clusterId: 'fakeClusterId',
  kmsKeyId: 'fakeKmsKeyId',
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

const resultBase = {
  LogicalResourceId: 'fakeLogicalResourceId',
  PhysicalResourceId: 'fakePhysicalResourceId',
  Reason: 'foo',
  RequestId: 'fakeRequestId',
  StackId: 'fakeStackId',
  Status: 'SUCCESS',
};

describe('create', () => {
  const createEvent: CloudFormationCustomResourceCreateEvent = {
    ...eventBase,
    RequestType: 'Create',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      clusterId: 'aurora-cluster-1',
      kmsKeyId: 'fakeKmsKeyId',
    },
  };

  it('fails when onCreate fails', async () => {
    onCreateStub.resolves({
      ...resultBase,
      Status: 'FAILED',
    });
    const r = await OnEvent(createEvent, context, callback);
    expect(r.Status).toEqual('FAILED');
  });

  it('succeeds when onCreate succeeds', async () => {
    onCreateStub.resolves({
      ...resultBase,
      Status: 'SUCCESS',
      Data: { k: 'fakeData' },
    });
    const r = await OnEvent(createEvent, context, callback);
    expect(r.Status).toEqual('SUCCESS');
    expect(r.Data).toEqual({ k: 'fakeData' });
  });
});

describe('update', () => {
  const updateEvent: CloudFormationCustomResourceUpdateEvent = {
    ...eventBase,
    OldResourceProperties: {},
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: 'Update',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      clusterId: 'aurora-cluster-1',
      kmsKeyId: 'fakeKmsKeyId',
    },
  };

  // I mean... this should never happen, but...
  it('fails when onUpate fails', async () => {
    onUpdateStub.resolves({
      ...resultBase,
      Status: 'FAILED',
    });
    const r = await OnEvent(updateEvent, context, callback);
    expect(r.Status).toEqual('FAILED');
  });

  it('succeeds when onUpdate succeeds', async () => {
    onUpdateStub.resolves({
      ...resultBase,
      Status: 'SUCCESS',
    });
    const r = await OnEvent(updateEvent, context, callback);
    expect(r.Status).toEqual('SUCCESS');
  });
});

describe('delete', () => {
  const deleteEvent: CloudFormationCustomResourceDeleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: 'Delete',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      clusterId: 'aurora-cluster-1',
      kmsKeyId: 'fakeKmsKeyId',
    },
  };

  it('fails when onDelete fails', async () => {
    onDeleteStub.resolves({
      ...resultBase,
      Status: 'FAILED',
    });

    const r = await OnEvent(deleteEvent, context, callback);
    expect(r.Status).toEqual('FAILED');
  });

  it('succeeds when onDelete succeeds', async () => {
    onDeleteStub.resolves({
      ...resultBase,
      Status: 'SUCCESS',
    });
    const r = await OnEvent(deleteEvent, context, callback);
    expect(r.Status).toEqual('SUCCESS');
  });
});
