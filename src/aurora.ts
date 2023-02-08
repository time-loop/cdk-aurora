import { join } from 'path';
import {
  Annotations,
  aws_ec2,
  aws_iam,
  aws_kms,
  aws_lambda,
  aws_lambda_nodejs,
  aws_logs,
  aws_rds,
  CfnMapping,
  CfnOutput,
  custom_resources,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { Construct, IDependable } from 'constructs';
import { Namer } from 'multi-convention-namer';

import {} from './aurora.provision-database';
import { RdsUserProvisionerProps } from './aurora.provision-user';
import { clusterArn } from './helpers';

const passwordRotationVersion = '1.1.217';

// Workaround for bug https://github.com/aws/aws-sdk-js-v3/issues/3063#issuecomment-1188564123
declare global {
  interface ReadableStream {}
}

export interface AuroraProps {
  /**
   * Turn on the Activity Stream feature of the Aurora cluster.
   * @default false
   */
  readonly activityStream?: boolean;
  /**
   * Name the database you would like a database created.
   * This also will target which database has default grants applied for users.
   */
  readonly databaseName: string;
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
   * The KMS key to use... everywhere
   */
  readonly kmsKey: aws_kms.IKey;
  /**
   * Security groups to use for the RDS Proxy.
   * @default - create a single new security group to use for the proxy.
   */
  readonly proxySecurityGroups?: aws_ec2.ISecurityGroup[];
  /**
   * @default - passthrough
   */
  readonly removalPolicy?: RemovalPolicy;
  /**
   * @default Duration.days(1) This should pass through, but nope. So, we're duplicating the default.
   */
  readonly retention?: Duration;
  /**
   * Security groups to use for the Aurora cluster.
   * @default - create a single new security group to use for the cluster.
   */
  readonly securityGroups?: aws_ec2.ISecurityGroup[];
  /**
   * Schemas to create and grant defaults for users.
   * @default ['public']
   */
  readonly schemas?: string[];
  /**
   * Prefix for secrets. Useful for sharding out multiple Auroras in the same environment.
   * @default - no prefix
   */
  readonly secretPrefix?: string | Namer;
  /**
   * When bootstrapping, hold off on creating the `addRotationMultiUser`.
   * NOTE: the multiUser strategy relies on a `_clone` user, which is potentially surprising.
   * See https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets_strategies.html#rotating-secrets-two-users
   * @default false
   */
  readonly skipAddRotationMultiUser?: boolean;
  /**
   * Skip provisioning the database?
   *
   * @default false
   */
  readonly skipProvisionDatabase?: boolean;
  /**
   * When bootstrapping, hold off on provisioning users in the database.
   *
   * @default false
   */
  readonly skipUserProvisioning?: boolean;
  /**
   * By default, we provide a proxy for non-manager users.
   * @default false
   */
  readonly skipProxy?: boolean;
  /**
   * Postgres version
   * Be aware of version limitations
   * See https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraFeaturesRegionsDBEngines.grids.html#Concepts.Aurora_Fea_Regions_DB-eng.Feature.RDS_Proxy
   * @default 12.8
   */
  readonly postgresEngineVersion?: aws_rds.AuroraPostgresEngineVersion;
  /**
   * In which VPC should the cluster be created?
   */
  readonly vpc: aws_ec2.IVpc;
  /**
   * @default - none, fallthrough to Aurora default subnet selection strategy
   */
  readonly vpcSubnets?: aws_ec2.SubnetSelection;
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
 * We have a CustomResource which fills the gap of creating the users
 * and provisioning some default grants:
 *
 * ```sql
 * GRANT CONNECT ON DATABASE databaseName TO "my_stack_reader";
 * GRANT USAGE ON SCHEMA public TO "my_stack_reader";
 * ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_reader";
 * ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO "my_stack_reader";
 *
 * GRANT CONNECT ON DATABASE databaseName TO "my_stack_writer";
 * GRANT USAGE ON SCHEMA public TO "my_stack_writer";
 * ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_writer";
 * ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "my_stack_writer";
 * ```
 */
export class Aurora extends Construct {
  readonly activityStreamArn?: string;
  readonly cluster: aws_rds.DatabaseCluster;
  readonly kmsKey: aws_kms.IKey;
  readonly proxy?: aws_rds.DatabaseProxy;
  readonly proxySecurityGroups?: aws_ec2.ISecurityGroup[];
  readonly secrets: aws_rds.DatabaseSecret[];
  readonly securityGroups: aws_ec2.ISecurityGroup[];

  constructor(scope: Construct, id: Namer, props: AuroraProps) {
    super(scope, id.pascal);

    const schemas = props.schemas ?? ['public'];

    const encryptionKey = (this.kmsKey = props.kmsKey);
    const instanceType =
      props.instanceType || aws_ec2.InstanceType.of(aws_ec2.InstanceClass.T4G, aws_ec2.InstanceSize.MEDIUM);
    if (instanceType.architecture !== aws_ec2.InstanceArchitecture.ARM_64) {
      Annotations.of(this).addWarning(
        `Instance type ${instanceType.toString()} is not ARM64. Please consider using the more cost effective graviton based instances.`,
      );
    }

    const secretPrefix =
      props.secretPrefix instanceof Namer ? props.secretPrefix : new Namer([props.secretPrefix ?? '']);

    const secretName = id.addSuffix(['manager']);
    const version = props.postgresEngineVersion ?? aws_rds.AuroraPostgresEngineVersion.VER_12_8;

    if (props.securityGroups) {
      this.securityGroups = props.securityGroups;
    } else {
      this.securityGroups = [
        new aws_ec2.SecurityGroup(this, 'SecurityGroup', {
          vpc: props.vpc,
          allowAllOutbound: true,
        }),
      ];
    }

    this.cluster = new aws_rds.DatabaseCluster(this, 'Database', {
      backup: {
        retention: props.retention ?? Duration.days(1),
        preferredWindow: '01:00-03:00', // 6pm Pacific time through 8pm
      },
      clusterIdentifier: id.pascal,
      credentials: {
        username: secretName.snake,
        encryptionKey,
        secretName: secretName.addPrefix(secretPrefix).pascal,
      },
      engine: aws_rds.DatabaseClusterEngine.auroraPostgres({
        version,
      }),
      instanceIdentifierBase: id.pascal,
      instanceProps: {
        instanceType,
        securityGroups: this.securityGroups,
        vpc: props.vpc,
        vpcSubnets: props.vpcSubnets,
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

    // Enable the ActivityStream, if requested
    const myConstruct = this;
    const myStack = Stack.of(this);
    if (props.activityStream) {
      function activityStreamHandler(handler: string): aws_lambda_nodejs.NodejsFunction {
        const fn = new aws_lambda_nodejs.NodejsFunction(myConstruct, `ActivityStream${handler}`, {
          bundling: { minify: true },
          entry: join(__dirname, 'aurora.activity-stream.ts'),
          handler,
          logRetention: aws_logs.RetentionDays.ONE_WEEK,
          tracing: aws_lambda.Tracing.ACTIVE,
        });

        [
          new aws_iam.PolicyStatement({
            actions: ['rds:DescribeDBClusters', 'rds:StartActivityStream', 'rds:StopActivityStream'],
            resources: [clusterArn(myStack.region, myStack.account, myConstruct.cluster.clusterIdentifier)],
          }),
          new aws_iam.PolicyStatement({
            actions: ['kms:CreateGrant', 'kms:DescribeKey'],
            resources: [myConstruct.kmsKey.keyArn],
          }),
        ].forEach((policy) => fn.addToRolePolicy(policy));

        return fn;
      }

      const activityStreamProvider = new custom_resources.Provider(this, 'ActivityStreamProvider', {
        logRetention: aws_logs.RetentionDays.ONE_WEEK,
        onEventHandler: activityStreamHandler('OnEvent'),
        isCompleteHandler: activityStreamHandler('IsComplete'),
      });

      const resource = new CustomResource(this, 'ActivityStream', {
        serviceToken: activityStreamProvider.serviceToken,
        resourceType: 'Custom::AuroraActivityStream',
        properties: {
          clusterId: this.cluster.clusterIdentifier,
          kmsKeyId: this.kmsKey.keyArn,
        },
      });

      this.activityStreamArn = resource.getAttString('PhysicalResourceId');
    }

    const managerRotation = this.cluster.addRotationSingleUser();
    // https://github.com/aws/aws-cdk/issues/18249#issuecomment-1005121223
    const managerSarMapping = managerRotation.node.findChild('SARMapping') as CfnMapping;
    managerSarMapping.setValue('aws', 'semanticVersion', passwordRotationVersion);

    const provisionerProps: aws_lambda_nodejs.NodejsFunctionProps = {
      bundling: {
        externalModules: ['aws-lambda', 'aws-sdk'], // Lambda is just types. SDK is explicitly provided.
        minify: true,
        nodeModules: ['pg', 'pg-format'],
      },
      environment: {
        MANAGER_SECRET_ARN: this.cluster.secret!.secretArn,
      },
      logRetention: aws_logs.RetentionDays.ONE_WEEK,
      tracing: aws_lambda.Tracing.ACTIVE,
      vpc: props.vpc,
    };

    const databaseProvisioner = new aws_lambda_nodejs.NodejsFunction(this, 'provision-database', provisionerProps);
    [
      new aws_iam.PolicyStatement({
        actions: ['DescribeSecret', 'GetSecretValue', 'ListSecretVersionIds'].map((s) => `secretsmanager:${s}`),
        resources: [this.cluster.secret!.secretArn],
      }),
      new aws_iam.PolicyStatement({
        actions: ['Decrypt', 'Describe*', 'Generate*', 'List*'].map((s) => `kms:${s}`),
        resources: [this.kmsKey.keyArn],
      }),
    ].forEach((s) => databaseProvisioner.addToRolePolicy(s));
    this.cluster.connections.allowDefaultPortFrom(databaseProvisioner, 'Database provisioning lambda');

    const databaseProvider = new custom_resources.Provider(this, 'DatabaseProvider', {
      logRetention: aws_logs.RetentionDays.ONE_WEEK,
      onEventHandler: databaseProvisioner,
    });

    const userDependencies: IDependable[] = [];
    if (!props.skipProvisionDatabase) {
      const provisionedDatabase = new CustomResource(this, 'DatabaseProvisioner', {
        properties: {
          databaseName: props.databaseName,
          schemas,
        },
        resourceType: 'Custom::AuroraDatabase',
        serviceToken: databaseProvider.serviceToken,
      });
      userDependencies.push(provisionedDatabase);
    }

    // Deploy user provisioner custom resource
    // See: https://github.com/aws/aws-cdk/issues/19794 for details.
    const userProvisioner = new aws_lambda_nodejs.NodejsFunction(this, 'provision-user', provisionerProps);
    [
      new aws_iam.PolicyStatement({
        actions: ['DescribeSecret', 'GetSecretValue', 'ListSecretVersionIds'].map((s) => `secretsmanager:${s}`),
        resources: [this.cluster.secret!.secretArn],
      }),
      new aws_iam.PolicyStatement({
        actions: ['Decrypt', 'Describe*', 'Generate*', 'List*'].map((s) => `kms:${s}`),
        resources: [this.kmsKey.keyArn],
      }),
    ].forEach((s) => userProvisioner.addToRolePolicy(s));
    this.cluster.connections.allowDefaultPortFrom(userProvisioner, 'User provisioning lambda');

    const userProvider = new custom_resources.Provider(this, 'UserProvider', {
      logRetention: aws_logs.RetentionDays.ONE_WEEK,
      onEventHandler: userProvisioner,
    });

    const rdsUserProvisioner = (provisionerId: Namer, properties: RdsUserProvisionerProps) => {
      const provisionedUser = new CustomResource(this, provisionerId.addSuffix(['creator']).pascal, {
        resourceType: 'Custom::AuroraUser',
        properties,
        serviceToken: userProvider.serviceToken,
      });
      provisionedUser.node.addDependency(...userDependencies); // We depend on the roles.
      return provisionedUser;
    };

    // User management
    // TODO: support arbitrary reader and writer users
    const secrets = ['reader', 'writer'].map((userStr) => {
      const user = new Namer([userStr]);
      const username = id.addSuffix(user).snake;
      const secret = new aws_rds.DatabaseSecret(this, user.pascal, {
        username,
        encryptionKey,
        secretName: id.addSuffix(user).addPrefix(secretPrefix).pascal,
        masterSecret: this.cluster.secret,
      });
      secret.attach(this.cluster); // This inserts the DB info into the secret

      userProvisioner.addToRolePolicy(
        new aws_iam.PolicyStatement({
          actions: ['DescribeSecret', 'GetSecretValue', 'ListSecretVersionIds', 'PutSecretValue'].map(
            (s) => `secretsmanager:${s}`,
          ),
          resources: [secret.secretArn],
        }),
      );

      if (!props.skipAddRotationMultiUser) {
        const rotation = this.cluster.addRotationMultiUser(user.pascal, { secret });
        // https://github.com/aws/aws-cdk/issues/18249#issuecomment-1005121223
        const sarMapping = rotation.node.findChild('SARMapping') as CfnMapping;
        sarMapping.setValue('aws', 'semanticVersion', passwordRotationVersion);
      }
      return { userStr, secret };
    });

    this.secrets = secrets.map((s) => s.secret);

    if (!props.skipProxy) {
      if (props.proxySecurityGroups) {
        this.proxySecurityGroups = props.proxySecurityGroups;
      } else {
        this.proxySecurityGroups = [
          new aws_ec2.SecurityGroup(this, 'ProxySecurityGroup', {
            vpc: props.vpc,
            allowAllOutbound: true,
          }),
        ];
      }
      this.proxy = new aws_rds.DatabaseProxy(this, 'Proxy', {
        dbProxyName: id.pascal,
        proxyTarget: aws_rds.ProxyTarget.fromCluster(this.cluster),
        //requireTLS: true, // If we're never allowing connections from outside the VPC, why bother?
        secrets: this.secrets,
        securityGroups: this.proxySecurityGroups,
        vpc: props.vpc,
      });
      new CfnOutput(this, 'ProxyEndpoint', {
        exportName: id.addSuffix(['Proxy', 'Endpoint']).pascal,
        value: this.proxy.endpoint,
      });
    }

    if (!props.skipUserProvisioning) {
      secrets.map((s) => {
        const rdsUser = rdsUserProvisioner(new Namer([s.userStr]), {
          isWriter: s.userStr === 'writer',
          proxyHost: this.proxy?.endpoint,
          userSecretArn: s.secret.secretArn,
        });
        rdsUser.node.addDependency(this.cluster);
      });
    }
  }
}
