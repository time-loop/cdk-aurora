[![codecov](https://codecov.io/gh/time-loop/cdk-aurora/branch/main/graph/badge.svg?token=gj4E1luEdC)](https://codecov.io/gh/time-loop/cdk-aurora)

# cdk-aurora

## WARNINGS

### Proxy / Multiuser rotation incompatibility

The multiuser rotation scheme works by having two actual user roles for each "user".
The second user role is just the original with `_clone` appended to the name.
For this discussion we'll call them `user` and `user_clone`.

At any given time, the SecretsManager secret has the name and password for one of these two users.
When the rotation lambda is triggered, it pulls the secret to find out which user is currently active.
Next it generates a new password for the inactive user and updates it in the database.
Finally, it updates the secret to swap users and provides the newly activated user's password.
See https://aws.amazon.com/blogs/database/multi-user-secrets-rotation-for-amazon-rds/ for details.

Here's an example of a rotation:
Let's assume that `user_clone` is currently active.
- generate a new password and assign it to `user` in the database.
- update Secret to have `user` as the active user and provide the new password.

The application always, even if it fetched the secret several days ago, can connect to the database.
The whole point of this approach is to provide a window of opportunity for the application to update it's connection string.

MEANWHILE

RDS Proxy receives a list of SecretsManager secrets for access management:
https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseProxy.html#secrets

When the rotation happens, the secret is updated.
RDS Proxy says "ok, so, `user_clone` is no longer allowed to connect. Instead `user` is allowed to connect."
Which makes perfect sense, except... the application still wants to connect as `user_clone`.
The "window of opportunity" has been slammed closed and we have effectively the "single user rotation" pattern.

## Example deploy with connection via JumpHost

```ts
import { Aurora } from '@time-loop/cdk-aurora';
import { JumpBox } from '@time-loop/cdk-jump-box';
import { App, aws_ec2, aws_kms, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Namer } from 'multi-convention-namer';

export class AuroraDemoStack extends Stack {
  constructor(scope: Construct, props: StackProps) {
    const id = new Namer(['aurora', 'demo']);
    super(scope, id.pascal, props);

    const vpc = aws_ec2.Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });

    const kmsKey = new aws_kms.Key(this, 'Key', {
      description: `${id.pascal} encryption key`,
    });

    const a = new Aurora(this, id, {
      defaultDatabaseName: 'demo',
      instances: 1, // It's just a demo
      kmsKey,
      vpc,
    });
    const j = new JumpBox(this, id.addSuffix(['jump']), { kmsKey, sshAccess: true, vpc: this.vpc });
    a.cluster.connections.allowDefaultPortFrom(j.securityGroup);
    a.proxy!.connections.allowFrom(j.securityGroup, aws_ec2.Port.tcp(5432));
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new AuroraDemoStack(app, { env: devEnv });

app.synth();
```


### Bootstrapping
1. [Install](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) the session manager plugin:

```bash
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/sessionmanager-bundle.zip" -o "sessionmanager-bundle.zip"
unzip sessionmanager-bundle.zip

# use python3 instead of python2 on your mac
python3 sessionmanager-bundle/install
```

2. Make sure the following is in your `~/.ssh/config`:

```
# SSH over Session Manager
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

3. Get the SSH key such as `~/.ssh/myAwsProfile-AuroraDemoJump.pem`:

```bash
export AWS_PROFILE=myAwsProfile
export AWS_REGION=us-west-2

STACK_NAME="AuroraDemo"
ASG_NAME="${STACK_NAME}Jump"

# Fetch the SSH key from SecretsManager
SSH_KEY_NAME="$HOME/.ssh/${AWS_PROFILE}-${ASG_NAME}.pem"
aws secretsmanager get-secret-value --region=us-west-2 --output=text --query SecretString --secret-id "ec2-ssh-key/${ASG_NAME}/private" > "$SSH_KEY_NAME"
chmod 400 "$SSH_KEY_NAME"
```

### To Connect

```bash
export AWS_PROFILE=myAwsProfile
export AWS_REGION=us-west-2

STACK_NAME="AuroraDemo"
ASG_NAME="${STACK_NAME}Jump"

SSH_KEY_NAME="$HOME/.ssh/${AWS_PROFILE}-${ASG_NAME}.pem"

# Set us up the Jumpbox
aws autoscaling set-desired-capacity --auto-scaling-group-name "$ASG_NAME" --desired-capacity 1

# Find the jump box instance
while
  JUMP_INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --query "AutoScalingGroups[?AutoScalingGroupName=='$ASG_NAME'].Instances[].InstanceId" --output=text)
  [[ -z "$JUMP_INSTANCE_ID" ]];
do
  sleep 10
done

# Pull the connection information secret as a JSON blob
DBROLE="Reader" # Also supports Writer and Manager (for DDL)
SECRET=$(aws secretsmanager get-secret-value --region=us-west-2 --output=text --query SecretString --secret-id "${STACK_NAME}${DBROLE}")

# Parse the JSON blob (jq is cleaner, but everyone already has node)
DBUSER=$(node -pe 'JSON.parse(require("fs").readFileSync("/dev/stdin").toString()).username' <<< "$SECRET")
PASSWORD=$(node -pe 'JSON.parse(require("fs").readFileSync("/dev/stdin").toString()).password' <<< "$SECRET")

# The manager user connects directly to the aurora cluster
if [[ -z "${DBUSER##*_manager}" ]]; then
  HOST=$(node -pe 'JSON.parse(require("fs").readFileSync("/dev/stdin").toString()).host' <<< "$SECRET")
  PORT=$(node -pe 'JSON.parse(require("fs").readFileSync("/dev/stdin").toString()).port' <<< "$SECRET")
else
  HOST=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?ExportName=='${STACK_NAME}ProxyEndpoint'].OutputValue" --output=text)
  PORT=5432
fi

if grep -F "$DBUSER" ~/.pgpass > /dev/null; then
  echo "Found $DBUSER in ~/.pgpass"
else
  echo "Adding $DBUSER to ~/.pgpass"
  echo "*:*:*:$DBUSER:$PASSWORD" >> ~/.pgpass
  chmod 0600 ~/.pgpass
fi

# Find an unused local port
# https://unix.stackexchange.com/a/132524/119704 (see first comment)
LOCAL_PORT=$(python -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')

# Create an auto-closing tunnel, then connect using psql
# See http://www.g-loaded.eu/2006/11/24/auto-closing-ssh-tunnels/ for details
ssh -f -i "$SSH_KEY_NAME" -L "$LOCAL_PORT:$HOST:$PORT" "ec2-user@$JUMP_INSTANCE_ID"  sleep 10 && \
psql --host localhost --port "$LOCAL_PORT" --username "$DBUSER" clickup

#########################################################
# Alternatively, you can run the tunnel command by it'self as follows
# if you wanted to run your code locally and have it connect
# To do that,
# - remove the `sleep 10` command
# - add the -N parameter to the command
# This creates a tunnel that is not ephemeral.
# You will have to manage the tunnel yourself,
# specifically kill the SSH session when you're done using the tunnel.
# You can put LOCAL_PORT=5432 if don't already have postgres running locally.

ssh -N -f -i "$SSH_KEY" -L "$LOCAL_PORT:$HOST:$PORT" "ec2-user@$JUMP_INSTANCE_ID"
```

## Troubleshooting

### DB Provisioner

Did your DB provisioner not run?
Check the Lambda's logfiles, you should see the grants it ran.
To manually fix issues, you can run the following commands:

```
# Show database connect privs
\l

# grant db connect privs
GRANT CONNECT ON DATABASE foo TO r_reader
GRANT CONNECT ON DATABASE foo TO r_writer

# Show schema privs
\dn+

# Grant access to schemas
GRANT USAGE ON SCHEMA task_mgmt TO r_reader;
GRANT USAGE ON SCHEMA task_mgmt TO r_writer;

# Show default privs
\ddp

# Add missing defaults
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO r_reader;
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO r_writer;

ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO r_reader;
ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO r_writer;

# Show table privs
SET search_path TO task_mgmt;
\dp

# Fix perms for tables which should have been defaulted:
grant select on all tables in schema task_mgmt to r_reader;
grant select, insert, update, delete on all tables in schema task_mgmt to r_writer;
```

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
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.instances">instances</a></code> | <code>number</code> | How many instances? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | https://aws.amazon.com/blogs/aws/new-amazon-rds-on-graviton2-processors/ says we can use Graviton2 processors. Yay! |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.lambdaLogRetention">lambdaLogRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | How long to retain logs published by provisioning lambdas. |
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

##### `instances`<sup>Optional</sup> <a name="instances" id="@time-loop/cdk-aurora.AuroraProps.property.instances"></a>

```typescript
public readonly instances: number;
```

- *Type:* number
- *Default:* passthrough

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
- *Default:* 12.8

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



