import * as awsLambda from 'aws-lambda';
import * as _awsSdk from 'aws-sdk';
import * as awsXray from 'aws-xray-sdk-core';
import { Client, ClientConfig } from 'pg';
/* eslint-disable @typescript-eslint/no-require-imports */
import format = require('pg-format');
/* eslint-enable @typescript-eslint/no-require-imports */
const awsSdk = awsXray.captureAWS(_awsSdk);

export interface RdsUserProvisionerProps {
  /**
   * The secretArn for the user to be created / granted.
   */
  readonly userSecretArn: string;
  /**
   * Should this user be granted "writer" defaults or "reader" defaults?
   * @default false
   */
  readonly isWriter?: boolean;
  /**
   * The address of the proxy.
   */
  readonly proxyHost?: string;
}

interface NoData {}

interface ResultProps {
  /**
   * Required by CloudFormation, however we don't use it.
   */
  Data?: NoData; // We won't actually be returning any data here.
  /**
   * We will be using the username for this.
   */
  PhysicalResourceId: string;
  /**
   * We will always add a suffix which references the logStreamName.
   */
  ReasonPrefix?: string;
  /**
   * Did it work?
   */
  Status: CfnStatus;
}

interface CreateUpdateProps {
  LogicalResourceId: string;
  logStreamName: string;
  RequestId: string;
  StackId: string;

  userSecretArn: string;
  isWriter: boolean;
  proxyHost?: string;
}

export interface SecretsResult {
  /**
   * DB Connection information
   */
  clientConfig: ClientConfig;
  /**
   * The username to be provisioned
   */
  username: string;
  /**
   * The password to be provisioned
   */
  password: string;
}

enum CfnStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/**
 * Defined by CloudFormation.
 */
enum CfnRequestType {
  CREATE = 'Create',
  UPDATE = 'Update',
  DELETE = 'Delete',
}

export async function handler(
  event: awsLambda.CloudFormationCustomResourceEvent,
  context: awsLambda.Context,
  callback: awsLambda.Callback,
): Promise<awsLambda.CloudFormationCustomResourceResponse> {
  try {
    switch (event.RequestType) {
      case CfnRequestType.CREATE:
        return await onCreate(event as awsLambda.CloudFormationCustomResourceCreateEvent, context, callback);
      case CfnRequestType.UPDATE:
        return await onUpdate(event as awsLambda.CloudFormationCustomResourceUpdateEvent, context, callback);
      case CfnRequestType.DELETE:
        return await onDelete(event as awsLambda.CloudFormationCustomResourceDeleteEvent, context, callback);
      default:
        return await Promise.reject(`Unknown event RequestType in event ${event}`);
    }
  } catch (err) {
    console.error(err);
    return Promise.reject(`Failed, see ${context.logStreamName}`);
  }
}

/**
 * On create, conform
 * @param event
 * @param context
 * @param _callback
 * @returns
 */
async function onCreate(
  event: awsLambda.CloudFormationCustomResourceEvent,
  context: awsLambda.Context,
  _callback: awsLambda.Callback,
): Promise<awsLambda.CloudFormationCustomResourceResponse> {
  console.log(`onCreate event: ${JSON.stringify(event)}`);
  return createUpdate({
    ...event,
    ...context,
    userSecretArn: event.ResourceProperties.userSecretArn,
    isWriter: event.ResourceProperties.isWriter === 'true',
    proxyHost: event.ResourceProperties.proxyHost,
  });
}

/**
 * On updates, conform.
 *
 * @param event
 * @param context
 * @param _callback
 * @returns
 */
const onUpdate = async (
  event: awsLambda.CloudFormationCustomResourceUpdateEvent,
  context: awsLambda.Context,
  _callback: awsLambda.Callback,
): Promise<awsLambda.CloudFormationCustomResourceResponse> => {
  console.log(`onUpdate event: ${JSON.stringify(event)}`);
  return createUpdate({
    ...event,
    ...context,
    userSecretArn: event.ResourceProperties.userSecretArn,
    isWriter: event.ResourceProperties.isWriter === 'true',
    proxyHost: event.ResourceProperties.proxyHost,
  });
};

/**
 * Currently a no-op... but we could actually remove the user. Do we want to?
 * @param event
 * @param context
 * @param _callback
 * @returns
 */
const onDelete = async (
  event: awsLambda.CloudFormationCustomResourceDeleteEvent,
  context: awsLambda.Context,
  _callback: awsLambda.Callback,
): Promise<awsLambda.CloudFormationCustomResourceResponse> => {
  console.log(`onDelete event: ${JSON.stringify(event)}`);
  return {
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: event.PhysicalResourceId,
    Reason: `See CloudWatch Log Stream: ${context.logStreamName}`,
    RequestId: event.RequestId,
    StackId: event.StackId,
    Status: CfnStatus.SUCCESS,
  };
};

/**
 * Conform user secret (if necessary),
 * create the user (if necessary),
 * create the database (if necessary),
 * and grant the user access.
 *
 * @param props
 * @returns
 */
export async function createUpdate(props: CreateUpdateProps): Promise<awsLambda.CloudFormationCustomResourceResponse> {
  const resultFactory = (p: ResultProps): awsLambda.CloudFormationCustomResourceResponse => {
    return {
      LogicalResourceId: props.LogicalResourceId,
      PhysicalResourceId: p.PhysicalResourceId,
      RequestId: props.RequestId,
      Reason: `${p.ReasonPrefix} see also ${props.logStreamName}`,
      StackId: props.StackId,
      Status: p.Status,
    };
  };

  // Fetch managerSecretArn from environment variable.
  const managerSecretArn = process.env.MANAGER_SECRET_ARN;
  if (!managerSecretArn) {
    const ReasonPrefix = 'Failed to find MANAGER_SECRET_ARN in environment variables';
    console.log(ReasonPrefix);
    return resultFactory({
      PhysicalResourceId: 'none',
      ReasonPrefix,
      Status: CfnStatus.FAILED,
    });
  }

  const m = new Methods();

  let secretResult: SecretsResult;
  try {
    console.log('Fetching credentials from Secrets Manager');
    secretResult = await m.fetchAndConformSecrets(managerSecretArn, props.userSecretArn, props.proxyHost);
  } catch (err) {
    return resultFactory({
      PhysicalResourceId: 'none',
      ReasonPrefix: `Secrets issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }
  const usernameClone = secretResult.username + '_clone';

  let client: Client;
  try {
    console.log(`Connecting to database "postgres"`);
    client = new Client({
      ...secretResult.clientConfig,
      database: 'postgres', // Defaulting to postgres is fine since we just are handling users.
    });
    await client.connect();
  } catch (err) {
    console.log(`client.connect failed: ${err}`);
    return resultFactory({
      PhysicalResourceId: secretResult.username,
      ReasonPrefix: `client.connect failed: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  try {
    const role = props.isWriter ? 'r_writer' : 'r_reader';
    const userAndClone = [secretResult.username, usernameClone];
    console.log(`Creating users "${secretResult.username}" and "${usernameClone}"`);
    await Promise.all(userAndClone.map((u) => m.createUser(client, u)));
    console.log(`Conforming passwords`);
    await Promise.all(userAndClone.map((u) => m.conformPassword(client, u, secretResult.password)));
    console.log(`Granting role ${role}`);
    await Promise.all(userAndClone.map((u) => m.grantRole(client, u, role)));
  } catch (err) {
    return resultFactory({
      PhysicalResourceId: secretResult.username,
      ReasonPrefix: `Create / conform issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  return resultFactory({
    PhysicalResourceId: secretResult.username,
    ReasonPrefix: 'Success',
    Status: CfnStatus.SUCCESS,
  });
}

/**
 * This class exists only to work around the problem of mocking / stubbing out
 * these methods when testing the handler.
 * Writing testable code... is sometimes a little weird.
 */
export class Methods {
  /**
   * Fetch secrets from SecretsManager and conform the user secret
   * by adding a host and engine, as necessary.
   * The vast majority of this stuff should be handled by the
   * `secret.attach(cluster)` call in the stack.
   * But... I wrote this before I knew about the `attach()` method.
   * @param managerSecretArn
   * @param userSecretArn
   * @param proxyHost
   * @returns
   */
  public async fetchAndConformSecrets(
    managerSecretArn: string,
    userSecretArn: string,
    proxyHost?: string,
  ): Promise<SecretsResult> {
    const secretsManager = new awsSdk.SecretsManager();

    console.log(`Fetching secret ${managerSecretArn}`);
    const managerSecretRaw = await secretsManager.getSecretValue({ SecretId: managerSecretArn }).promise();
    const managerSecret = JSON.parse(managerSecretRaw.SecretString!);

    console.log(`Fetching secret ${userSecretArn}`);
    const userSecretRaw = await secretsManager.getSecretValue({ SecretId: userSecretArn }).promise();
    const userSecret = JSON.parse(userSecretRaw.SecretString!);

    // Pull the host and engine information from the managerSecret and push it into the userSecret.
    var updatedUserSecret = false;
    if (!userSecret.hasOwnProperty('host')) {
      console.log('Updating user secret with host from manager secret');
      userSecret.host = managerSecret.host;
      updatedUserSecret = true;
    }
    if (!userSecret.host) {
      console.log('Updating user secret with host from manager secret');
      userSecret.host = managerSecret.host;
      updatedUserSecret = true;
    }

    if (!userSecret.hasOwnProperty('engine')) {
      console.log('Updating user secret with engine from manager secret');
      userSecret.engine = managerSecret.engine;
      updatedUserSecret = true;
    }
    if (!userSecret.engine) {
      console.log('Updating user secret with engine from manager secret');
      userSecret.engine = managerSecret.engine;
      updatedUserSecret = true;
    }

    if (!proxyHost) {
      if (userSecret.hasOwnProperty('proxyHost')) {
        console.log('Updating user secret to remove proxyHost since we do not have proxyHost');
        delete userSecret.proxyHost;
        updatedUserSecret = true;
      }
    } else {
      if (!userSecret.hasOwnProperty('proxyHost')) {
        console.log('Updating user secret to add proxyHost');
        userSecret.proxyHost = proxyHost;
        updatedUserSecret = true;
      }
      if (userSecret.proxyHost != proxyHost) {
        console.log('Updating user secret, proxyHost changed');
        userSecret.proxyHost = proxyHost;
        updatedUserSecret = true;
      }
    }

    // push secret, if updated
    if (!updatedUserSecret) {
      console.log(
        `User ${JSON.stringify(
          userSecret.username,
        )} secret already has host and engine information. Nothing to update.`,
      );
    } else {
      console.log(`Updating user secret for ${JSON.stringify(userSecret.username)}.`);
      const r = await secretsManager
        .putSecretValue({ SecretId: userSecretArn, SecretString: JSON.stringify(userSecret) })
        .promise();
      console.log(`putSecretValue ${userSecretArn} response: ${JSON.stringify(r)}`);
      if (r.$response.error) {
        throw r.$response.error;
      }
    }

    return {
      clientConfig: {
        host: managerSecret.host,
        port: managerSecret.port,
        user: managerSecret.username,
        password: managerSecret.password,
      },
      username: userSecret.username,
      password: userSecret.password,
    };
  }

  /**
   * Does the user already exist? If not, create them.
   * @param client
   * @param username
   * @returns -
   */
  public async createUser(client: Client, username: string): Promise<void> {
    try {
      const res = await client.query(`SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`, [username]);
      if (res.rowCount > 0) {
        console.log(`User ${username} already exists. Skipping creation.`);
      } else {
        const sql = format('CREATE USER %I PASSWORD NULL', username);
        console.log(`Running: ${sql}`);
        const sqlRes = await client.query(sql);
        console.log(`Result of ${sql}: rowCount: ${sqlRes.rowCount}, rows: ${JSON.stringify(sqlRes.rows)}`);
      }
      const sql = format(`ALTER ROLE %I NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT`, username);
      console.log(`Running: ${sql}`);
      const sqlRes = await client.query(sql);
      console.log(`Result of ${sql}: rowCount: ${sqlRes.rowCount}, rows: ${JSON.stringify(sqlRes.rows)}`);
    } catch (err) {
      console.log(`Failed creating ${username}: ${JSON.stringify(err)}`);
      throw err;
    }
  }

  /**
   * Bonk password on the user.
   * @param client
   * @param username
   * @param password
   */
  public async conformPassword(client: Client, username: string, password: string): Promise<void> {
    try {
      const alterPassword = format('ALTER USER %I WITH ENCRYPTED PASSWORD %L', username, password);
      console.log(`Updating password for ${username} from secret`);
      const sqlRes = await client.query(alterPassword);
      console.log(
        `Result of ALTER USER ... WITH ENCRYPTED PASSWORD ...: rowCount: ${sqlRes.rowCount}, rows: ${JSON.stringify(
          sqlRes.rows,
        )}`,
      );
    } catch (err) {
      console.log(`Failed updating password for ${username}: ${JSON.stringify(err)}`);
      throw err;
    }
  }

  /**
   * Grant privileges to the user.
   * @param client
   * @param databaseName what database to grant privileges in
   * @param username
   * @param role which role to grant
   */
  public async grantRole(client: Client, username: string, role: string): Promise<void> {
    try {
      const sql = format('GRANT %I TO %I', role, username);
      console.log(`Running: ${sql}`);
      const sqlRes = await client.query(sql);
      console.log(`Result: rowCount: ${sqlRes.rowCount}, rows: ${JSON.stringify(sqlRes.rows)}`);
    } catch (err) {
      console.log(`Failed granting ${role} to ${username}: ${JSON.stringify(err)}`);
      throw err;
    }
  }
}
