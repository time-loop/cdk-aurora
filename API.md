# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### Aurora <a name="Aurora" id="@time-loop/cdk-aurora.Aurora"></a>

Opinionated Aurora.

Three users: manager, writer, reader all in SecretsManager w/ rotations.
- All access is via the proxy, enforced by security group.
- Proxy is available from the `ProxyEndpoint` output.

```ts
const a = new Aurora(this, 'Aurora', {
  kmsKey: aws_kms.Key.fromKeyArn(this, 'Key', 'some arn'),
  instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.R6G, aws_ec2.InstanceSize.XLARGE24)
 });
```

We have a CustomResource which fills the gap of creating the users
and provisioning some default grants:

```sql
GRANT CONNECT ON DATABASE databaseName TO "my_stack_reader";
GRANT USAGE ON SCHEMA public TO "my_stack_reader";
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_reader";
ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO "my_stack_reader";

GRANT CONNECT ON DATABASE databaseName TO "my_stack_writer";
GRANT USAGE ON SCHEMA public TO "my_stack_writer";
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_writer";
ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "my_stack_writer";
```

#### Initializers <a name="Initializers" id="@time-loop/cdk-aurora.Aurora.Initializer"></a>

```typescript
import { Aurora } from '@time-loop/cdk-aurora'

new Aurora(scope: Construct, id: Namer, props: AuroraProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@time-loop/cdk-aurora.Aurora.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.Initializer.parameter.id">id</a></code> | <code>multi-convention-namer.Namer</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.Initializer.parameter.props">props</a></code> | <code><a href="#@time-loop/cdk-aurora.AuroraProps">AuroraProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@time-loop/cdk-aurora.Aurora.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@time-loop/cdk-aurora.Aurora.Initializer.parameter.id"></a>

- *Type:* multi-convention-namer.Namer

---

##### `props`<sup>Required</sup> <a name="props" id="@time-loop/cdk-aurora.Aurora.Initializer.parameter.props"></a>

- *Type:* <a href="#@time-loop/cdk-aurora.AuroraProps">AuroraProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@time-loop/cdk-aurora.Aurora.toString">toString</a></code> | Returns a string representation of this construct. |

---

##### `toString` <a name="toString" id="@time-loop/cdk-aurora.Aurora.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@time-loop/cdk-aurora.Aurora.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@time-loop/cdk-aurora.Aurora.isConstruct"></a>

```typescript
import { Aurora } from '@time-loop/cdk-aurora'

Aurora.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@time-loop/cdk-aurora.Aurora.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_rds.DatabaseCluster</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.kmsKey">kmsKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.secrets">secrets</a></code> | <code>aws-cdk-lib.aws_rds.DatabaseSecret[]</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.vpcSubnets">vpcSubnets</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.activityStreamArn">activityStreamArn</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.proxy">proxy</a></code> | <code>aws-cdk-lib.aws_rds.DatabaseProxy</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.proxySecurityGroups">proxySecurityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@time-loop/cdk-aurora.Aurora.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `cluster`<sup>Required</sup> <a name="cluster" id="@time-loop/cdk-aurora.Aurora.property.cluster"></a>

```typescript
public readonly cluster: DatabaseCluster;
```

- *Type:* aws-cdk-lib.aws_rds.DatabaseCluster

---

##### `kmsKey`<sup>Required</sup> <a name="kmsKey" id="@time-loop/cdk-aurora.Aurora.property.kmsKey"></a>

```typescript
public readonly kmsKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey

---

##### `secrets`<sup>Required</sup> <a name="secrets" id="@time-loop/cdk-aurora.Aurora.property.secrets"></a>

```typescript
public readonly secrets: DatabaseSecret[];
```

- *Type:* aws-cdk-lib.aws_rds.DatabaseSecret[]

---

##### `securityGroups`<sup>Required</sup> <a name="securityGroups" id="@time-loop/cdk-aurora.Aurora.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]

---

##### `vpcSubnets`<sup>Required</sup> <a name="vpcSubnets" id="@time-loop/cdk-aurora.Aurora.property.vpcSubnets"></a>

```typescript
public readonly vpcSubnets: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

---

##### `activityStreamArn`<sup>Optional</sup> <a name="activityStreamArn" id="@time-loop/cdk-aurora.Aurora.property.activityStreamArn"></a>

```typescript
public readonly activityStreamArn: string;
```

- *Type:* string

---

##### `proxy`<sup>Optional</sup> <a name="proxy" id="@time-loop/cdk-aurora.Aurora.property.proxy"></a>

```typescript
public readonly proxy: DatabaseProxy;
```

- *Type:* aws-cdk-lib.aws_rds.DatabaseProxy

---

##### `proxySecurityGroups`<sup>Optional</sup> <a name="proxySecurityGroups" id="@time-loop/cdk-aurora.Aurora.property.proxySecurityGroups"></a>

```typescript
public readonly proxySecurityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]

---


## Structs <a name="Structs" id="Structs"></a>

### AuroraProps <a name="AuroraProps" id="@time-loop/cdk-aurora.AuroraProps"></a>

#### Initializer <a name="Initializer" id="@time-loop/cdk-aurora.AuroraProps.Initializer"></a>

```typescript
import { AuroraProps } from '@time-loop/cdk-aurora'

const auroraProps: AuroraProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.databaseName">databaseName</a></code> | <code>string</code> | Name the database you would like a database created. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.kmsKey">kmsKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | The KMS key to use... everywhere. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | In which VPC should the cluster be created? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.activityStream">activityStream</a></code> | <code>boolean</code> | Turn on the Activity Stream feature of the Aurora cluster. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.cloudwatchLogsExports">cloudwatchLogsExports</a></code> | <code>string[]</code> | Which logs to export to CloudWatch. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.cloudwatchLogsRetention">cloudwatchLogsRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | How long to retain logs published to CloudWatch logs. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.commonRotationUserOptions">commonRotationUserOptions</a></code> | <code>aws-cdk-lib.aws_rds.CommonRotationUserOptions</code> | Common password rotation options. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.deletionProtection">deletionProtection</a></code> | <code>boolean</code> | Indicates whether the DB cluster should have deletion protection enabled. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.instances">instances</a></code> | <code>number</code> | How many instances? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | https://aws.amazon.com/blogs/aws/new-amazon-rds-on-graviton2-processors/ says we can use Graviton2 processors. Yay! |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.lambdaLogRetention">lambdaLogRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | How long to retain logs published by provisioning lambdas. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.parameterGroup">parameterGroup</a></code> | <code>aws-cdk-lib.aws_rds.IParameterGroup</code> | Additional parameters to pass to the database engine. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.parameters">parameters</a></code> | <code>{[ key: string ]: string}</code> | The parameters in the DBClusterParameterGroup to create automatically. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.performanceInsightRetention">performanceInsightRetention</a></code> | <code>aws-cdk-lib.aws_rds.PerformanceInsightRetention</code> | How long to retain performance insights data in days. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.postgresEngineVersion">postgresEngineVersion</a></code> | <code>aws-cdk-lib.aws_rds.AuroraPostgresEngineVersion</code> | Postgres version Be aware of version limitations See https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraFeaturesRegionsDBEngines.grids.html#Concepts.Aurora_Fea_Regions_DB-eng.Feature.RDS_Proxy. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.proxySecurityGroups">proxySecurityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to use for the RDS Proxy. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.removalPolicy">removalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.retention">retention</a></code> | <code>aws-cdk-lib.Duration</code> | RDS backup retention. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.schemas">schemas</a></code> | <code>string[]</code> | Schemas to create and grant defaults for users. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.secretPrefix">secretPrefix</a></code> | <code>string \| multi-convention-namer.Namer</code> | Prefix for secrets. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to use for the Aurora cluster. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.skipAddRotationMultiUser">skipAddRotationMultiUser</a></code> | <code>boolean</code> | When bootstrapping, hold off on creating the `addRotationMultiUser`. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.skipManagerRotation">skipManagerRotation</a></code> | <code>boolean</code> | Skipping rotation for the manager user's password. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.skipProvisionDatabase">skipProvisionDatabase</a></code> | <code>boolean</code> | Skip provisioning the database? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.skipProxy">skipProxy</a></code> | <code>boolean</code> | By default, we provide a proxy for non-manager users. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.skipUserProvisioning">skipUserProvisioning</a></code> | <code>boolean</code> | When bootstrapping, hold off on provisioning users in the database. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.vpcSubnets">vpcSubnets</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Used to decide which subnets to place the cluster in. |

---

##### `databaseName`<sup>Required</sup> <a name="databaseName" id="@time-loop/cdk-aurora.AuroraProps.property.databaseName"></a>

```typescript
public readonly databaseName: string;
```

- *Type:* string

Name the database you would like a database created.

This also will target which database has default grants applied for users.

---

##### `kmsKey`<sup>Required</sup> <a name="kmsKey" id="@time-loop/cdk-aurora.AuroraProps.property.kmsKey"></a>

```typescript
public readonly kmsKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey

The KMS key to use... everywhere.

---

##### `vpc`<sup>Required</sup> <a name="vpc" id="@time-loop/cdk-aurora.AuroraProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

In which VPC should the cluster be created?

---

##### `activityStream`<sup>Optional</sup> <a name="activityStream" id="@time-loop/cdk-aurora.AuroraProps.property.activityStream"></a>

```typescript
public readonly activityStream: boolean;
```

- *Type:* boolean
- *Default:* false

Turn on the Activity Stream feature of the Aurora cluster.

---

##### `cloudwatchLogsExports`<sup>Optional</sup> <a name="cloudwatchLogsExports" id="@time-loop/cdk-aurora.AuroraProps.property.cloudwatchLogsExports"></a>

```typescript
public readonly cloudwatchLogsExports: string[];
```

- *Type:* string[]
- *Default:* ['postgresql']

Which logs to export to CloudWatch.

See
https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.CloudWatch.html

---

##### `cloudwatchLogsRetention`<sup>Optional</sup> <a name="cloudwatchLogsRetention" id="@time-loop/cdk-aurora.AuroraProps.property.cloudwatchLogsRetention"></a>

```typescript
public readonly cloudwatchLogsRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* aws_logs.RetentionDays.ONE_MONTH

How long to retain logs published to CloudWatch logs.

---

##### `commonRotationUserOptions`<sup>Optional</sup> <a name="commonRotationUserOptions" id="@time-loop/cdk-aurora.AuroraProps.property.commonRotationUserOptions"></a>

```typescript
public readonly commonRotationUserOptions: CommonRotationUserOptions;
```

- *Type:* aws-cdk-lib.aws_rds.CommonRotationUserOptions
- *Default:* none, AWS defaults to 30 day rotation

Common password rotation options.

See
https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.CommonRotationUserOptions.html

---

##### `deletionProtection`<sup>Optional</sup> <a name="deletionProtection" id="@time-loop/cdk-aurora.AuroraProps.property.deletionProtection"></a>

```typescript
public readonly deletionProtection: boolean;
```

- *Type:* boolean
- *Default:* true if `removalPolicy` is RETAIN, `undefined` otherwise, which will not enable deletion protection. To disable deletion protection after it has been enabled, you must explicitly set this value to `false`.

Indicates whether the DB cluster should have deletion protection enabled.

---

##### `instances`<sup>Optional</sup> <a name="instances" id="@time-loop/cdk-aurora.AuroraProps.property.instances"></a>

```typescript
public readonly instances: number;
```

- *Type:* number
- *Default:* 2 one for writer and one for reader

How many instances?

DevOps strongly recommends at least 3 in prod environments and only 1 in dev environments.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@time-loop/cdk-aurora.AuroraProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* aws_ec2.InstanceType.of(aws_ec2.InstanceClass.T4G,aws_ec2.InstanceSize.MEDIUM)

https://aws.amazon.com/blogs/aws/new-amazon-rds-on-graviton2-processors/ says we can use Graviton2 processors. Yay!

---

##### `lambdaLogRetention`<sup>Optional</sup> <a name="lambdaLogRetention" id="@time-loop/cdk-aurora.AuroraProps.property.lambdaLogRetention"></a>

```typescript
public readonly lambdaLogRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* aws_logs.RetentionDays.THREE_MONTHS

How long to retain logs published by provisioning lambdas.

These are extremely low volume, and super handy to have around.

---

##### `parameterGroup`<sup>Optional</sup> <a name="parameterGroup" id="@time-loop/cdk-aurora.AuroraProps.property.parameterGroup"></a>

```typescript
public readonly parameterGroup: IParameterGroup;
```

- *Type:* aws-cdk-lib.aws_rds.IParameterGroup
- *Default:* No parameter group.

Additional parameters to pass to the database engine.

You can only specify parameterGroup or parameters but not both.

---

##### `parameters`<sup>Optional</sup> <a name="parameters" id="@time-loop/cdk-aurora.AuroraProps.property.parameters"></a>

```typescript
public readonly parameters: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* defaultParameters  const defaultParameters = { // While these are mentioned in the docs, applying them doesn't work. 'rds.logical_replication': '1', // found in the cluster parameters. // wal_level: 'logical', // not found in cluster parameters, but implicitly set by rds.logical_replication max_replication_slots: '10', // Arbitrary, must be > 1 max_wal_senders: '10', // Arbitrary, must be > 1 wal_sender_timeout: '0', // Never time out. Risky, but recommended. };

The parameters in the DBClusterParameterGroup to create automatically.

You can only specify parameterGroup or parameters but not both.
You need to use a versioned engine to auto-generate a DBClusterParameterGroup.

---

##### `performanceInsightRetention`<sup>Optional</sup> <a name="performanceInsightRetention" id="@time-loop/cdk-aurora.AuroraProps.property.performanceInsightRetention"></a>

```typescript
public readonly performanceInsightRetention: PerformanceInsightRetention;
```

- *Type:* aws-cdk-lib.aws_rds.PerformanceInsightRetention
- *Default:* passthrough (was 7 days as of cdk 2.78.0)

How long to retain performance insights data in days.

Free tier is 7 days.
See: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-rds-dbinstance.html#cfn-rds-dbinstance-performanceinsightsretentionperiod

---

##### `postgresEngineVersion`<sup>Optional</sup> <a name="postgresEngineVersion" id="@time-loop/cdk-aurora.AuroraProps.property.postgresEngineVersion"></a>

```typescript
public readonly postgresEngineVersion: AuroraPostgresEngineVersion;
```

- *Type:* aws-cdk-lib.aws_rds.AuroraPostgresEngineVersion
- *Default:* 15.5

Postgres version Be aware of version limitations See https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraFeaturesRegionsDBEngines.grids.html#Concepts.Aurora_Fea_Regions_DB-eng.Feature.RDS_Proxy.

---

##### `proxySecurityGroups`<sup>Optional</sup> <a name="proxySecurityGroups" id="@time-loop/cdk-aurora.AuroraProps.property.proxySecurityGroups"></a>

```typescript
public readonly proxySecurityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* create a single new security group to use for the proxy.

Security groups to use for the RDS Proxy.

---

##### `removalPolicy`<sup>Optional</sup> <a name="removalPolicy" id="@time-loop/cdk-aurora.AuroraProps.property.removalPolicy"></a>

```typescript
public readonly removalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy
- *Default:* passthrough

---

##### `retention`<sup>Optional</sup> <a name="retention" id="@time-loop/cdk-aurora.AuroraProps.property.retention"></a>

```typescript
public readonly retention: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(1) This should pass through, but nope. So, we're duplicating the default.

RDS backup retention.

---

##### `schemas`<sup>Optional</sup> <a name="schemas" id="@time-loop/cdk-aurora.AuroraProps.property.schemas"></a>

```typescript
public readonly schemas: string[];
```

- *Type:* string[]
- *Default:* ['public']

Schemas to create and grant defaults for users.

---

##### `secretPrefix`<sup>Optional</sup> <a name="secretPrefix" id="@time-loop/cdk-aurora.AuroraProps.property.secretPrefix"></a>

```typescript
public readonly secretPrefix: string | Namer;
```

- *Type:* string | multi-convention-namer.Namer
- *Default:* no prefix

Prefix for secrets.

Useful for sharding out multiple Auroras in the same environment.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@time-loop/cdk-aurora.AuroraProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* create a single new security group to use for the cluster.

Security groups to use for the Aurora cluster.

---

##### `skipAddRotationMultiUser`<sup>Optional</sup> <a name="skipAddRotationMultiUser" id="@time-loop/cdk-aurora.AuroraProps.property.skipAddRotationMultiUser"></a>

```typescript
public readonly skipAddRotationMultiUser: boolean;
```

- *Type:* boolean
- *Default:* false

When bootstrapping, hold off on creating the `addRotationMultiUser`.

NOTE: the multiUser strategy relies on a `_clone` user, which is potentially surprising.
See https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets_strategies.html#rotating-secrets-two-users

---

##### `skipManagerRotation`<sup>Optional</sup> <a name="skipManagerRotation" id="@time-loop/cdk-aurora.AuroraProps.property.skipManagerRotation"></a>

```typescript
public readonly skipManagerRotation: boolean;
```

- *Type:* boolean
- *Default:* false

Skipping rotation for the manager user's password.

---

##### `skipProvisionDatabase`<sup>Optional</sup> <a name="skipProvisionDatabase" id="@time-loop/cdk-aurora.AuroraProps.property.skipProvisionDatabase"></a>

```typescript
public readonly skipProvisionDatabase: boolean;
```

- *Type:* boolean
- *Default:* false

Skip provisioning the database?

Useful for bootstrapping stacks to get the majority of resources in place.
The db provisioner will:
- create the database (if it doesn't already exist)
- create the schemas (if they don't already exist)
- create (if they don't already exist) and configure the r_reader and r_writer roles

NOTE: This will implicitly skip user provisioning, too.

---

##### `skipProxy`<sup>Optional</sup> <a name="skipProxy" id="@time-loop/cdk-aurora.AuroraProps.property.skipProxy"></a>

```typescript
public readonly skipProxy: boolean;
```

- *Type:* boolean
- *Default:* false

By default, we provide a proxy for non-manager users.

---

##### `skipUserProvisioning`<sup>Optional</sup> <a name="skipUserProvisioning" id="@time-loop/cdk-aurora.AuroraProps.property.skipUserProvisioning"></a>

```typescript
public readonly skipUserProvisioning: boolean;
```

- *Type:* boolean
- *Default:* false except when skipProvisionDatabase is true, then also true

When bootstrapping, hold off on provisioning users in the database.

Useful for bootstrapping stacks to get the majority of resources in place.
The user provisioner will:
- conform the users' secret (ensure the host, engine, proxyHost keys are present and correct)
- create the user (if it doesn't already exist) and related `_clone` user
- conform the user's password to what appears in the secrets manager secret (heal from broken rotations)
- grant the r_reader or r_writer role to the user and it's `_clone`.

NOTE: This is implicitly true if skipProvisionDatabase is true.

---

##### `vpcSubnets`<sup>Optional</sup> <a name="vpcSubnets" id="@time-loop/cdk-aurora.AuroraProps.property.vpcSubnets"></a>

```typescript
public readonly vpcSubnets: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* {subnetType:aws_ec2.SubnetType.PRIVATE_WITH_EGRESS} - all private subnets

Used to decide which subnets to place the cluster in.

Which also decides the subnets for the RDS Proxy,
and the provisioning lambdas.

Previously we would just fallthrough for the Aurora and RDS stuff,
but then we don't have a reasonable solution for our provisioning lambdas.

---



