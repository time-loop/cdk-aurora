[![codecov](https://codecov.io/gh/time-loop/cdk-aurora/branch/main/graph/badge.svg?token=gj4E1luEdC)](https://codecov.io/gh/time-loop/cdk-aurora)

# cdk-aurora

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
