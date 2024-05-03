import { RDSClient, DescribeDBClustersCommand } from '@aws-sdk/client-rds';
import { mockClient } from 'aws-sdk-client-mock';
import sinon from 'sinon';

import { Methods } from '../src/aurora.activity-stream';

sinon.stub(console, 'log');

describe('getClusterArn', () => {
  const m = new Methods();
  const rdsMock = mockClient(RDSClient);

  beforeEach(() => {
    rdsMock.reset();
  });

  it('found', () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        {
          DBClusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1',
        },
      ],
    });

    return m.getClusterArn('aurora-cluster-1').then((result) => {
      expect(result).toEqual('arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1');
    });
  });
  it('not found', () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [],
    });

    return m.getClusterArn('aurora-cluster-1').then((result) => {
      expect(result).toEqual('Not found');
    });
  });
  it('found multiple', () => {
    rdsMock.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        {
          DBClusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1',
        },
        {
          DBClusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:aurora-cluster-1',
        },
      ],
    });

    return m.getClusterArn('aurora-cluster-1').then((result) => {
      expect(result).toEqual('Multiple clusters found');
    });
  });
});
