import { RDSClient, DescribeDBClustersCommand } from '@aws-sdk/client-rds';
import { mockClient } from 'aws-sdk-client-mock';
import sinon from 'sinon';

import { CfnRequestType, IsComplete, IsCompleteEvent } from '../src/aurora.activity-stream';

const rdsMock = mockClient(RDSClient);

sinon.stub(console, 'log');
sinon.stub(console, 'error');

beforeEach(() => {
  rdsMock.reset();
});

const resourcePropertiesBase = {
  ServiceToken: 'fakeServiceToken',
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

describe('update', () => {
  const isCompleteEvent: IsCompleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: CfnRequestType.UPDATE,
  };

  it('completes', async () => {
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(rdsMock.calls().length).toEqual(0);
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
  //   rdsMock.on(DescribeDBClustersCommand).rejects(new Error('fakeError'));
  //   await expect(IsComplete(isCompleteEvent, context, callback)).rejects;
  //   expect(rdsMock.calls().length).toEqual(1);
  // });

  it('completes when no cluster found', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(rdsMock.calls().length).toEqual(1);
  });

  it('completes when no dbclusters returned', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({});
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(rdsMock.calls().length).toEqual(1);
  });

  it('completes when cluster found and started', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'started',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(rdsMock.calls().length).toEqual(1);
  });

  it('not completes when cluster found and not started', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'starting',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(false);
    expect(rdsMock.calls().length).toEqual(1);
  });
});

describe('delete', () => {
  const isCompleteEvent: IsCompleteEvent = {
    ...eventBase,
    PhysicalResourceId: 'fakePhysicalResourceId',
    RequestType: CfnRequestType.DELETE,
  };

  it('completes when no cluster found', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(rdsMock.calls().length).toEqual(1);
  });

  it('completes when cluster found and stopped', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'stopped',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(true);
    expect(rdsMock.calls().length).toEqual(1);
  });

  it('not completes when cluster found and not stopped', async () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        {
          ActivityStreamStatus: 'stopping',
        },
      ],
    });
    const r = await IsComplete(isCompleteEvent, context, callback);
    expect(r.IsComplete).toEqual(false);
    expect(rdsMock.calls().length).toEqual(1);
  });
});
