import * as awsLambda from 'aws-lambda';
import * as _awsSdk from 'aws-sdk';
import * as awsXray from 'aws-xray-sdk-core';
import { Client, ClientConfig } from 'pg';
import format = require('pg-format');
const awsSdk = awsXray.captureAWS(_awsSdk);

export interface RdsUserProvisionerProps {
  /**
   * The secretArn for the user to be created / granted.
   */
  readonly userSecretArn: string;
  /**
   * The database to be granted
   */
  readonly dbName?: string;
  /**
   * Should this user be granted "writer" defaults or "reader" defaults?
   * @default false
   */
  readonly isWriter?: boolean;
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

enum CfnStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

interface NoData {}

interface CreateResultProps {
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

async function onCreate(
  event: awsLambda.CloudFormationCustomResourceEvent,
  context: awsLambda.Context,
  _callback: awsLambda.Callback,
): Promise<awsLambda.CloudFormationCustomResourceResponse> {
  const resultFactory = (props: CreateResultProps) => {
    return {
      ...props,
      LogicalResourceId: event.LogicalResourceId,
      Reason: `${props.ReasonPrefix} see also ${context.logStreamName}`,
      RequestId: event.RequestId,
      StackId: event.StackId,
    };
  };
  console.log(`onCreate event: ${JSON.stringify(event)}`);
  const userSecretArn = event.ResourceProperties.userSecretArn;
  const dbName = event.ResourceProperties.dbName;
  const isWriter = event.ResourceProperties.isWriter === 'true';

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

  let secretData;
  try {
    secretData = await fetchAndConformSecrets(managerSecretArn, userSecretArn);
  } catch (err) {
    return resultFactory({
      PhysicalResourceId: 'none',
      Status: CfnStatus.FAILED,
      ReasonPrefix: `Secrets issue: ${JSON.stringify(err)}`,
    });
  }

  const client = new Client({
    ...secretData.clientConfig,
    database: dbName ?? 'postgres', // The grants below care which db we are in. But defaulting to postgres is fine if we just are handling users.
  });
  await client.connect();

  try {
    await createUser(client, secretData.username);
    await conformPassword(client, secretData.username, secretData.password);
  } catch (err) {
    return resultFactory({
      PhysicalResourceId: secretData.username,
      Status: CfnStatus.FAILED,
    });
  }

  // If we didn't get a dbName, we're done.
  if (!dbName) {
    console.log(`No dbName specified. Skipping further grants.`);
    return resultFactory({
      PhysicalResourceId: secretData.username,
      Status: CfnStatus.SUCCESS,
    });
  }

  try {
    await grantPrivileges(client, secretData.username, dbName, isWriter);
  } catch (err) {
    return resultFactory({
      PhysicalResourceId: secretData.username,
      Status: CfnStatus.FAILED,
    });
  }

  return resultFactory({
    PhysicalResourceId: secretData.username,
    Status: CfnStatus.SUCCESS,
  });
}

/**
 * Currently a no-op. I don't think there's any value trying to do anything with this.
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

export async function fetchAndConformSecrets(managerSecretArn: string, userSecretArn: string): Promise<SecretsResult> {
  const secretsManager = new awsSdk.SecretsManager();

  const managerSecretRaw = await secretsManager.getSecretValue({ SecretId: managerSecretArn }).promise();
  const managerSecret = JSON.parse(managerSecretRaw.SecretString!);

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

  // push secret, if updated
  if (!updatedUserSecret) {
    console.log(
      `User ${JSON.stringify(userSecret.username)} secret already has host and engine information. Nothing to update.`,
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
export async function createUser(client: Client, username: string): Promise<void> {
  try {
    const res = await client.query(`SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`, [username]);
    if (res.rowCount > 0) {
      console.log(`User ${username} already exists. Skipping creation.`);
    } else {
      const sql = format('CREATE USER %I NOINHERIT PASSWORD NULL', username);
      console.log(`Running: ${sql}`);
      await client.query(sql);
    }
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
export async function conformPassword(client: Client, username: string, password: string): Promise<void> {
  try {
    const alterPassword = format('ALTER USER %I WITH ENCRYPTED PASSWORD %L', username, password);
    console.log(`Updating password for ${username} from secret`);
    await client.query(alterPassword);
  } catch (err) {
    console.log(`Failed updating password for ${username}: ${JSON.stringify(err)}`);
    throw err;
  }
}

/**
 * Grant privileges to the user.
 * @param client
 * @param dbName
 * @param username
 * @param isWriter
 */
export async function grantPrivileges(
  client: Client,
  dbName: string,
  username: string,
  isWriter: boolean,
): Promise<void> {
  try {
    [
      format('GRANT CONNECT ON DATABASE %I TO %I', dbName, username), // Usage on Database
      format('GRANT USAGE ON SCHEMA %I TO %I', 'public', username), // Usage on Schema
      format('ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO %I', username), // Defaults on sequences
      format(
        'ALTER DEFAULT PRIVILEGES GRANT SELECT%s ON TABLES TO %I',
        isWriter ? ', INSERT, UPDATE, DELETE' : '',
        username,
      ), // Defaults on tables
    ].forEach(async (sql) => {
      console.log(`Running: ${sql}`);
      await client.query(sql);
    });
  } catch (err) {
    console.log(`Failed granting privileges to ${username}: ${JSON.stringify(err)}`);
    throw err;
  }
}