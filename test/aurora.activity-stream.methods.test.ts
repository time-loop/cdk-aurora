import AWSMock from 'aws-sdk-mock';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEventCommon,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import sinon from 'sinon';

import { Methods } from '../src/aurora.activity-stream';

sinon.stub(console, 'log');

const m = new Methods();
const getClusterArnStub = sinon.stub(Methods.prototype, 'getClusterArn');
const startActivityStreamStub = sinon.stub();
const stopActivityStreamStub = sinon.stub();
AWSMock.mock('RDS', 'startActivityStream', startActivityStreamStub);
AWSMock.mock('RDS', 'stopActivityStream', stopActivityStreamStub);

beforeEach(() => {
  getClusterArnStub.reset();
  startActivityStreamStub.reset();
  stopActivityStreamStub.reset();
});

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

// const fakeInvokedFunctionArn = 'arn:aws:lambda:fakeRegion:fakeAccountId:function:fakeFunctionName';
const fakeClusterArn = 'arn:aws:rds:fakeRegion:fakeAccountId:cluster:fakeClusterId';

describe('onCreate', () => {
  const createEvent: CloudFormationCustomResourceCreateEvent = {
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
    expect(startActivityStreamStub.callCount).toEqual(0);
  });

  it('fails when startActivityStream fails', async () => {
    getClusterArnStub.resolves(fakeClusterArn);
    startActivityStreamStub.resolves({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      KinesisStreamName: undefined,
      Mode: 'async',
      Status: 'failed',
    });
    const r = await m.onCreate(createEvent, 'fakeLogStreamName', 'fakeInvokedFunctionArn');
    expect(r.Status).toEqual('FAILED');
    expect(r.PhysicalResourceId).toMatch('none');
    expect(startActivityStreamStub.callCount).toEqual(1);
    expect(startActivityStreamStub.args[0][0]).toEqual({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      Mode: 'async',
      ResourceArn: 'arn:aws:rds:fakeRegion:fakeAccountId:cluster:fakeClusterId',
    });
  });

  it('succeeds', async () => {
    getClusterArnStub.resolves(fakeClusterArn);
    startActivityStreamStub.resolves({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      KinesisStreamName: 'fakeKinesisStreamName',
      Mode: 'async',
      Status: 'starting',
    });
    const r = await m.onCreate(createEvent, 'fakeLogStreamName', 'fakeInvokedFunctionArn');
    expect(r.Status).toEqual('SUCCESS');
    expect(r.PhysicalResourceId).toMatch('fakeKinesisStreamName');
    expect(startActivityStreamStub.callCount).toEqual(1);
    expect(startActivityStreamStub.args[0][0]).toEqual({
      ApplyImmediately: true,
      KmsKeyId: 'fakeKmsKeyId',
      Mode: 'async',
      ResourceArn: 'arn:aws:rds:fakeRegion:fakeAccountId:cluster:fakeClusterId',
    });
  });
});

describe('onUpdate', () => {
  const updateEvent: CloudFormationCustomResourceUpdateEvent = {
    ...eventBase,
    OldResourceProperties: {},
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: 'Update',
  };

  it('does nothing and succeeds', async () => {
    const r = await m.onUpdate(updateEvent, 'fakeLogStreamName');
    expect(startActivityStreamStub.callCount).toEqual(0);
    expect(stopActivityStreamStub.callCount).toEqual(0);
    expect(r.Status).toEqual('SUCCESS');
  });
});

describe('onDelete', () => {
  const deleteEvent: CloudFormationCustomResourceDeleteEvent = {
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
    stopActivityStreamStub.resolves({ foo: 'bar' });

    const r = await m.onDelete(deleteEvent, 'fakeLogStreamName');
    expect(r.Status).toEqual('SUCCESS');
    expect(getClusterArnStub.callCount).toEqual(1);
    expect(startActivityStreamStub.callCount).toEqual(0);
    expect(stopActivityStreamStub.callCount).toEqual(1);
    expect(stopActivityStreamStub.args[0][0]).toEqual({
      ApplyImmediately: true,
      ResourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1',
    });
  });
});
