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

const eventBase = {
  LogicalResourceId: 'fakeLogicalResourceId',
  RequestId: 'fakeRequestId',
  ResourceType: 'Custom::RdsUser',
  ResponseURL: 'fakeResponseUrl',
  ResourceProperties: resourcePropertiesBase,
  ServiceToken: 'fakeServiceToken',
  StackId: 'fakeStackId',
};

const context = {
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

const callback = (_err: any, _data: any) => {};

const resultBase = {
  LogicalResourceId: 'fakeLogicalResourceId',
  PhysicalResourceId: 'fakePhysicalResourceId',
  Reason: 'foo',
  RequestId: 'fakeRequestId',
  StackId: 'fakeStackId',
  Status: 'SUCCESS',
};

describe('create', () => {
  const createEvent = {
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
  const updateEvent = {
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
  it('fails when onUpdate fails', async () => {
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
  const deleteEvent = {
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
