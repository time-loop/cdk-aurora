import {
  aws_ec2,
  aws_kms,
  aws_rds,
  CfnMapping,
  CfnOutput,
  // CustomResource,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
// import * as statement from 'cdk-iam-floyd';
import { Construct } from 'constructs';
import { Namer } from 'multi-convention-namer';

const passwordRotationVersion = '1.1.217';

export interface AuroraProps {
  /**
   * When bootstrapping, hold off on creating the `addRotationMultiUser` and also the proxy.
   *
   * @default false
   */
  readonly bootstrap?: boolean;
  /**
   * Would you like a database created? Otherwise you'll have to log in and create it.
   */
  readonly defaultDatabaseName?: string;
  /**
   * The KMS key to use... everywhere
   */
  readonly kmsKey: aws_kms.IKey;
  /**
   * How many instances? DevOps strongly recommends at least 3 in prod environments and only 1 in dev environments.
   * @default - passthrough
   */
  readonly instances?: number;
  /**
   * https://aws.amazon.com/blogs/aws/new-amazon-rds-on-graviton2-processors/
   * says we can use Graviton2 processors. So, M6G, R6G, C6G?
   * TODO: should we warn about non Graviton2 processor usage?
   * @default aws_ec2.InstanceType.of(aws_ec2.InstanceClass.T3,aws_ec2.InstanceSize.MEDIUM)
   */
  readonly instanceType?: aws_ec2.InstanceType;
  /**
   * @default - passthrough
   */
  readonly removalPolicy?: RemovalPolicy;
  /**
   * @default Duration.days(1) This should pass through, but nope. So, we're duplicating the default.
   */
  readonly retention?: Duration;
  /**
   * By default, we provide a proxy for non-manager users.
   * @default false
   */
  readonly skipProxy?: boolean;
  /**
   * In which VPC should the cluster be created?
   */
  readonly vpc: aws_ec2.IVpc;
}

/**
 * Opinionated Aurora
 *
 * - Three users: manager, writer, reader all in SecretsManager w/ rotations.
 * - All access is via the proxy, enforced by security group.
 * - Proxy is available from the `ProxyEndpoint` output.
 *
 * ```ts
 * const a = new Aurora(this, 'Aurora', {
 *   kmsKey: aws_kms.Key.fromKeyArn(this, 'Key', 'some arn'),
 *   instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.R6G, aws_ec2.InstanceSize.XLARGE24)
 *  });
 * ```
 *
 * NOTE: After deploying this in bootstrap mode, find the reader and writer secrets and add
 * ```
 * engine: postgres
 * host: ${{ cluster.clusterEndpoint }} // you'll have to look this up. Easiest way is to just look at the manager secret.
 * ```
 * to both secrets. Then deploy without bootstrap.
 * See: https://github.com/aws/aws-cdk/issues/19794
 * for details.
 *
 * Also! Looks like the multiRotation stuff doesn't actually... create the user.
 * Could just be because it's really old?
 * Trying https://github.com/aws/aws-cdk/issues/18249#issuecomment-1005121223 to see if that helps.
 *
 * So... we're going to need to build a lambda / custom resource to create the users.
 * Unfortunate. Grants:
 *
 * ```sql
 * GRANT USAGE ON DATABASE clickup TO "my_stack_reader";
 * GRANT USAGE ON SCHEMA public TO "my_stack_reader";
 * ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_reader";
 * ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO "my_stack_reader";
 *
 * GRANT USAGE ON DATABASE clickup TO "my_stack_writer";
 * GRANT USAGE ON SCHEMA public TO "my_stack_writer";
 * ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_writer";
 * ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "my_stack_writer";
 * ```
 */
export class Aurora extends Construct {
  readonly cluster: aws_rds.DatabaseCluster;
  readonly kmsKey: aws_kms.IKey;
  readonly proxy?: aws_rds.DatabaseProxy;
  readonly secrets: aws_rds.DatabaseSecret[];

  constructor(scope: Construct, id: Namer, props: AuroraProps) {
    super(scope, id.pascal);

    const encryptionKey = (this.kmsKey = props.kmsKey);
    const instanceType =
      props.instanceType || aws_ec2.InstanceType.of(aws_ec2.InstanceClass.T3, aws_ec2.InstanceSize.MEDIUM);

    const secretName = id.addSuffix(['manager']);

    this.cluster = new aws_rds.DatabaseCluster(this, 'Database', {
      backup: {
        retention: props.retention ?? Duration.days(1),
        preferredWindow: '01:00-03:00', // 6pm Pacific time through 8pm
      },
      clusterIdentifier: id.pascal,
      credentials: {
        username: secretName.snake,
        encryptionKey,
        secretName: secretName.pascal,
      },
      defaultDatabaseName: props.defaultDatabaseName,
      engine: aws_rds.DatabaseClusterEngine.auroraPostgres({
        version: aws_rds.AuroraPostgresEngineVersion.VER_12_8, // RDS Proxy limitation
      }),
      instanceIdentifierBase: id.pascal,
      instanceProps: {
        instanceType,
        vpc: props.vpc,
      },
      instances: props.instances,
      parameters: {
        // While these are mentioned in the docs, applying them doesn't work.
        'rds.logical_replication': '1', // found in the cluster parameters.
        // wal_level: 'logical', // not found in cluster parameters, but implicitly set byt rds.logical_replication
        max_replication_slots: '10', // Arbitrary, must be > 1
        max_wal_senders: '10', // Arbitrary, must be > 1
        wal_sender_timeout: '0', // Never time out. Risky, but recommended.
      },
      removalPolicy: props.removalPolicy,
      storageEncryptionKey: encryptionKey,
    });

    const readEndpointName = id.addSuffix(['read', 'endpoint']).pascal;
    new CfnOutput(this, readEndpointName, {
      exportName: readEndpointName,
      value: this.cluster.clusterReadEndpoint.socketAddress,
    });

    const managerRotation = this.cluster.addRotationSingleUser();
    // https://github.com/aws/aws-cdk/issues/18249#issuecomment-1005121223
    const managerSarMapping = managerRotation.node.findChild('SARMapping') as CfnMapping;
    managerSarMapping.setValue('aws', 'semanticVersion', passwordRotationVersion);

    // User management
    // const serviceToken = core.Param.get(this, '', { rootId: 'infra', stackId: '', constructId: '' });
    this.secrets = ['reader', 'writer'].map((userStr) => {
      const user = new Namer([userStr]);
      const secret = new aws_rds.DatabaseSecret(this, user.pascal, {
        username: id.addSuffix(user).snake,
        encryptionKey,
        secretName: id.addSuffix(user).pascal,
        masterSecret: this.cluster.secret,
      });

      // Create additional users
      // const userCreator = new CustomResource(this, user.addSuffix(['creator']).pascal, {
      //   resourceType: 'Custom::RdsUserCreator',
      //   properties: {
      //     managerSecretArn: this.cluster.secret!.secretArn, // implicit dependency because of user secret
      //     userSecretArn: secret.secretArn,
      //     isWriter: dbUser.isWriter ?? false,
      //   },
      //   serviceToken,
      // });
      // userCreator.node.addDependency(secret);

      if (!props.bootstrap) {
        const rotation = this.cluster.addRotationMultiUser(user.pascal, { secret });
        // https://github.com/aws/aws-cdk/issues/18249#issuecomment-1005121223
        const sarMapping = rotation.node.findChild('SARMapping') as CfnMapping;
        sarMapping.setValue('aws', 'semanticVersion', passwordRotationVersion);
      }
      return secret;
    });

    if (!props.skipProxy) {
      this.proxy = new aws_rds.DatabaseProxy(this, 'Proxy', {
        proxyTarget: aws_rds.ProxyTarget.fromCluster(this.cluster),
        secrets: this.secrets,
        vpc: props.vpc,
      });
      new CfnOutput(this, 'ProxyEndpoint', {
        exportName: id.addSuffix(['Proxy', 'Endpoint']).pascal,
        value: this.proxy.endpoint,
      });
    }
  }
}
