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

NOTE: After deploying this in bootstrap mode, find the reader and writer secrets and add
```
engine: postgres
host: ${{ cluster.clusterEndpoint }} // you'll have to look this up. Easiest way is to just look at the manager secret.
```
to both secrets. Then deploy without bootstrap.
See: https://github.com/aws/aws-cdk/issues/19794
for details.

Also! Looks like the multiRotation stuff doesn't actually... create the user.
Could just be because it's really old?
Trying https://github.com/aws/aws-cdk/issues/18249#issuecomment-1005121223 to see if that helps.

So... we're going to need to build a lambda / custom resource to create the users.
Unfortunate. Grants:

```sql
GRANT USAGE ON DATABASE clickup TO "my_stack_reader";
GRANT USAGE ON SCHEMA public TO "my_stack_reader";
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO "my_stack_reader";
ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO "my_stack_reader";

GRANT USAGE ON DATABASE clickup TO "my_stack_writer";
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

##### `isConstruct` <a name="isConstruct" id="@time-loop/cdk-aurora.Aurora.isConstruct"></a>

```typescript
import { Aurora } from '@time-loop/cdk-aurora'

Aurora.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

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
| <code><a href="#@time-loop/cdk-aurora.Aurora.property.proxy">proxy</a></code> | <code>aws-cdk-lib.aws_rds.DatabaseProxy</code> | *No description.* |

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

##### `proxy`<sup>Optional</sup> <a name="proxy" id="@time-loop/cdk-aurora.Aurora.property.proxy"></a>

```typescript
public readonly proxy: DatabaseProxy;
```

- *Type:* aws-cdk-lib.aws_rds.DatabaseProxy

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
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.kmsKey">kmsKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | The KMS key to use... everywhere. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | In which VPC should the cluster be created? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.bootstrap">bootstrap</a></code> | <code>boolean</code> | When bootstrapping, hold off on creating the `addRotationMultiUser` and also the proxy. |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.defaultDatabaseName">defaultDatabaseName</a></code> | <code>string</code> | Would you like a database created? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.instances">instances</a></code> | <code>number</code> | How many instances? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | https://aws.amazon.com/blogs/aws/new-amazon-rds-on-graviton2-processors/ says we can use Graviton2 processors. So, M6G, R6G, C6G? TODO: should we warn about non Graviton2 processor usage? |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.removalPolicy">removalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.retention">retention</a></code> | <code>aws-cdk-lib.Duration</code> | *No description.* |
| <code><a href="#@time-loop/cdk-aurora.AuroraProps.property.skipProxy">skipProxy</a></code> | <code>boolean</code> | By default, we provide a proxy for non-manager users. |

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

##### `bootstrap`<sup>Optional</sup> <a name="bootstrap" id="@time-loop/cdk-aurora.AuroraProps.property.bootstrap"></a>

```typescript
public readonly bootstrap: boolean;
```

- *Type:* boolean
- *Default:* false

When bootstrapping, hold off on creating the `addRotationMultiUser` and also the proxy.

---

##### `defaultDatabaseName`<sup>Optional</sup> <a name="defaultDatabaseName" id="@time-loop/cdk-aurora.AuroraProps.property.defaultDatabaseName"></a>

```typescript
public readonly defaultDatabaseName: string;
```

- *Type:* string

Would you like a database created?

Otherwise you'll have to log in and create it.

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
- *Default:* aws_ec2.InstanceType.of(aws_ec2.InstanceClass.T3,aws_ec2.InstanceSize.MEDIUM)

https://aws.amazon.com/blogs/aws/new-amazon-rds-on-graviton2-processors/ says we can use Graviton2 processors. So, M6G, R6G, C6G? TODO: should we warn about non Graviton2 processor usage?

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

---

##### `skipProxy`<sup>Optional</sup> <a name="skipProxy" id="@time-loop/cdk-aurora.AuroraProps.property.skipProxy"></a>

```typescript
public readonly skipProxy: boolean;
```

- *Type:* boolean
- *Default:* false

By default, we provide a proxy for non-manager users.

---



