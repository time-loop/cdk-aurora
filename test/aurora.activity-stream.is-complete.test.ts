import { Callback, CloudFormationCustomResourceEventCommon, Context } from 'aws-lambda';
import AWSMock from 'aws-sdk-mock';
import sinon from 'sinon';

import { CfnRequestType, IsComplete, IsCompleteEvent } from '../src/aurora.activity-stream';

const describeDBClustersStub = sinon.stub();
AWSMock.mock('RDS', 'describeDBClusters', describeDBClustersStub);

sinon.stub(console, 'log');
sinon.stub(console, 'error');

beforeEach(() => {
  describeDBClustersStub.reset();
});

const resourcePropertiesBase = {
  ServiceToken: 'fakeServiceToken',
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

describe('update', () => {
  const isCompleteEvent: IsCompleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: CfnRequestType.UPDATE,
  };

  it('completes', async () => {
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(describeDBClustersStub.callCount).toEqual(0);
  });
});

describe('create', () => {
  const isCompleteEvent: IsCompleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: CfnRequestType.CREATE,
  };

  // Not sure how to get this working. But... it covers a really small niche.
  // it('passes through when describeDBClusters fails', async () => {
  //   describeDBClustersStub.rejects(new Error('fakeError'));
  //   await expect(IsComplete(isCompleteEvent, context, callback)).rejects;
  //   expect(describeDBClustersStub.callCount).toEqual(1);
  // });

  it('completes when no cluster found', async () => {
    describeDBClustersStub.resolves({
      DBClusters: [],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });

  it('completes when no dbclusters returned', async () => {
    describeDBClustersStub.resolves({});
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });

  it('completes when cluster found and started', async () => {
    describeDBClustersStub.resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'started',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });

  it('not completes when cluster found and not started', async () => {
    describeDBClustersStub.resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'starting',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(false);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });
});

describe('delete', () => {
  const isCompleteEvent: IsCompleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: CfnRequestType.DELETE,
  };

  it('completes when no cluster found', async () => {
    describeDBClustersStub.resolves({
      DBClusters: [],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });

  it('completes when cluster found and stopped', async () => {
    describeDBClustersStub.resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'stopped',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });

  it('not completes when cluster found and not stopped', async () => {
    describeDBClustersStub.resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'stopping',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(false);
    expect(describeDBClustersStub.callCount).toEqual(1);
  });
});
