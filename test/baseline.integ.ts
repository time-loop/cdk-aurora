import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { Namer } from 'multi-convention-namer';

import { Aurora } from '../src';

export class BaselineStack extends Stack {
  constructor(scope: Construct, props: StackProps) {
    const id = new Namer(['aurora', 'baseline']);
    super(scope, id.pascal, props);

    const vpc = new Vpc(this, 'Vpc', { maxAzs: 2 }); // Cluster requires at least 2 subnets
    // const vpc = Vpc.fromLookup(this, 'Vpc', {
    //   isDefault: true,
    // });

    const kmsKey = new Key(this, 'Key', {
      description: `${id.pascal} encryption key`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new Aurora(this, id, {
      databaseName: 'demo',
      kmsKey,
      vpc,
      // Skip as much as possible
      instances: 1,
      skipAddRotationMultiUser: true,
      skipManagerRotation: true,
      skipProvisionDatabase: true,
      skipProxy: true,
      skipUserProvisioning: true,
    });
  }
}

const app = new App();
const stack = new BaselineStack(app, {
  env: {
    account: '425845004253',
    region: 'us-east-2',
  },
});

const integ = new IntegTest(app, 'Test', { testCases: [stack] });

const clusters = integ.assertions.awsApiCall('RDS', 'describeDBClusters', { DBClusterIdentifier: 'aurorabaseline' });
clusters.assertAtPath(
  'DBClusters.0.',
  ExpectedResult.objectLike({
    DBClusterIdentifier: 'aurorabaseline',
    Engine: 'aurora-postgresql',
    MasterUsername: 'aurora_baseline_manager',
    StorageEncrypted: true,
  }),
);

// integ.assertions.awsApiCall('RDS', 'listTagsForResource', {
//   ResourceName: 'arn:aws:rds:us-east-2:425845004253:cluster:Demo',
// });
