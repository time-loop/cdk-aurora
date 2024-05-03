import { RDSClient, StartActivityStreamCommand, StopActivityStreamCommand } from '@aws-sdk/client-rds';
import { mockClient } from 'aws-sdk-client-mock';
import sinon from 'sinon';

import { Methods } from '../src/aurora.activity-stream';

sinon.stub(console, 'log');

const m = new Methods();
const getClusterArnStub = sinon.stub(Methods.prototype, 'getClusterArn');
const rdsMock = mockClient(RDSClient);

beforeEach(() => {
  getClusterArnStub.reset();
  rdsMock.reset()
});

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

// const fakeInvokedFunctionArn = 'arn:aws:lambda:fakeRegion:fakeAccountId:function:fakeFunctionName';
const fakeClusterArn = 'arn:aws:rds:fakeRegion:fakeAccountId:cluster:fakeClusterId';

describe('onCreate', () => {
  const createEvent = {
    ...eventBase,
    RequestType: 'Create',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      clusterId: 'aurora-cluster-1',
      kmsKeyId: 'fakeKmsKeyId',
    },
  };

  it('fails when getClusterArn fails', async () => {
    getClusterArnStub.resolves('not-a-cluster-arn');
    const r = await m.onCreate(createEvent, 'fakeLogStreamName', 'fakeInvokedFunctionArn');
    expect(r.Status).toEqual('FAILED');
    expect(r.Reason).toMatch(`not-a-cluster-arn`);
    expect(rdsMock.calls().length).toEqual(0);
  });

  it('fails when startActivityStream fails', async () => {
    getClusterArnStub.resolves(fakeClusterArn);
    rdsMock.on(StartActivityStreamCommand).resolves({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      KinesisStreamName: undefined,
      Mode: 'async',
      Status: 'stopping',
    });
    const r = await m.onCreate(createEvent, 'fakeLogStreamName', 'fakeInvokedFunctionArn');
    expect(r.Status).toEqual('FAILED');
    expect(r.PhysicalResourceId).toMatch('none');
    expect(rdsMock.calls().length).toEqual(1);
    const call = rdsMock.calls()[0];
    expect(call.args[0].input).toEqual({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      Mode: 'async',
      ResourceArn: 'arn:aws:rds:fakeRegion:fakeAccountId:cluster:fakeClusterId',
    });
  });

  it('succeeds', async () => {
    getClusterArnStub.resolves(fakeClusterArn);
    rdsMock.on(StartActivityStreamCommand).resolves({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      KinesisStreamName: 'fakeKinesisStreamName',
      Mode: 'async',
      Status: 'starting',
    });
    const r = await m.onCreate(createEvent, 'fakeLogStreamName', 'fakeInvokedFunctionArn');
    expect(r.Status).toEqual('SUCCESS');
    expect(r.PhysicalResourceId).toMatch('fakeKinesisStreamName');
    expect(rdsMock.calls().length).toEqual(1);
    const call = rdsMock.calls()[0];
    expect(call.args[0].input).toEqual({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      Mode: 'async',
      ResourceArn: 'arn:aws:rds:fakeRegion:fakeAccountId:cluster:fakeClusterId',
    });
  });
});

describe('onUpdate', () => {
  const updateEvent = {
    ...eventBase,
    OldResourceProperties: {},
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: 'Update',
  };

  it('does nothing and succeeds', async () => {
    const r = await m.onUpdate(updateEvent, 'fakeLogStreamName');
    expect(rdsMock.calls().length).toEqual(0);
    expect(r.Status).toEqual('SUCCESS');
  });
});

describe('onDelete', () => {
  const deleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: 'Delete',
    ResourceProperties: {
      ServiceToken: 'fakeServiceToken',
      clusterId: 'aurora-cluster-1',
    },
  };

  it('warns when getClusterArn fails', async () => {
    getClusterArnStub.resolves('not-a-cluster-arn');
    const r = await m.onDelete(deleteEvent, 'fakeLogStreamName');
    expect(r.Status).toEqual('SUCCESS');
    expect(r.Reason).toMatch(`not-a-cluster-arn`);
  });

  it('success', async () => {
    getClusterArnStub.resolves('arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1');
    rdsMock.on(StopActivityStreamCommand).resolves({
      KmsKeyId: 'fakeKmsKeyId',
      KinesisStreamName: 'fakeKinesisStreamName',
      Status: 'stopping',
    });

    const r = await m.onDelete(deleteEvent, 'fakeLogStreamName');
    expect(r.Status).toEqual('SUCCESS');
    expect(getClusterArnStub.callCount).toEqual(1);
    expect(rdsMock.calls().length).toEqual(1);
    const call = rdsMock.calls()[0];
    expect(call.args[0].input).toEqual({
      ApplyImmediately: true,
      ResourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1',
    });
  });
});
