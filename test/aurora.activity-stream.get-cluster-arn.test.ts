import AWSMock from 'aws-sdk-mock';
import sinon from 'sinon';

import { Methods } from '../src/aurora.activity-stream';

sinon.stub(console, 'log');

describe('getClusterArn', () => {
  const m = new Methods();
  const describeDBClustersStub = sinon.stub();
  AWSMock.mock('RDS', 'describeDBClusters', describeDBClustersStub);

  beforeEach(() => {
    describeDBClustersStub.reset();
  });

  it('found', () => {
    describeDBClustersStub.yields(null, {
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
    describeDBClustersStub.yields(null, {
      DBClusters: [],
    });

    return m.getClusterArn('aurora-cluster-1').then((result) => {
      expect(result).toEqual('Not found');
    });
  });
  it('found multiple', () => {
    describeDBClustersStub.yields(null, {
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
