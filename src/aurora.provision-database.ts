import * as awsLambda from 'aws-lambda';
import * as _awsSdk from 'aws-sdk';
import * as awsXray from 'aws-xray-sdk-core';
import { Client, ClientConfig } from 'pg';
/* eslint-disable @typescript-eslint/no-require-imports */
import format = require('pg-format');
/* eslint-enable @typescript-eslint/no-require-imports */
const awsSdk = awsXray.captureAWS(_awsSdk);

export interface RdsDatabaseProvisionerProps {
  /**
   * The database to be granted
   */
  readonly databaseName: string;
  /**
   * Schemas to create and grant defaults for users.
   * @default ['public']
   */
  readonly schemas?: string[];
}

interface NoData {}

interface ResultProps {
  /**
   * Required by CloudFormation, however we don't use it.
   */
  Data?: NoData; // We won't actually be returning any data here.
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

  databaseName: string;
  schemas?: string[];
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
  console.log('Version 1 - split!');
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
    databaseName: event.ResourceProperties.databaseName,
    schemas: event.ResourceProperties.schemas,
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
    databaseName: event.ResourceProperties.databaseName,
    schemas: event.ResourceProperties.schemas,
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
  const schemas = props.schemas ?? [];

  const resultFactory = (p: ResultProps): awsLambda.CloudFormationCustomResourceResponse => {
    return {
      LogicalResourceId: props.LogicalResourceId,
      PhysicalResourceId: props.databaseName!,
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
      ReasonPrefix,
      Status: CfnStatus.FAILED,
    });
  }

  const m = new Methods();

  let clientConfig: ClientConfig;
  try {
    clientConfig = await m.fetchSecret(managerSecretArn);
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `Secrets issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  let client: Client;
  try {
    console.log(`Connecting to database "postgres"`);
    client = new Client({
      ...clientConfig,
      database: 'postgres', // The grants below care which db we are in. But defaulting to postgres is fine if we just are handling users.
    });
    await client.connect();
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `client.connect failed: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  try {
    await m.createDatabase(client, props.databaseName);
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `Create database issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  const roles = ['r_reader', 'r_writer'];
  try {
    await Promise.all(roles.map(async (role) => m.createRole(client, role)));
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `Create role issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  try {
    console.log(`Connecting to database "${props.databaseName}"`);
    client = new Client({
      ...clientConfig,
      database: props.databaseName, // The grants below care which db we are in.
    });
    await client.connect();
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `client.connect failed: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  try {
    await Promise.all(schemas.map((s) => m.createSchema(client, s)));
    // TODO: I need a way to catch these errors.
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `Create schema issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  try {
    await Promise.all(roles.map((role) => m.configureRole(client, props.databaseName, role, schemas)));
    // TODO: I need a way to catch these errors.
  } catch (err) {
    return resultFactory({
      ReasonPrefix: `Configure role issue: ${err}`,
      Status: CfnStatus.FAILED,
    });
  }

  return resultFactory({
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
  public async fetchSecret(managerSecretArn: string): Promise<ClientConfig> {
    const secretsManager = new awsSdk.SecretsManager();

    const managerSecretRaw = await secretsManager.getSecretValue({ SecretId: managerSecretArn }).promise();
    const managerSecret = JSON.parse(managerSecretRaw.SecretString!);

    return {
      host: managerSecret.host,
      port: managerSecret.port,
      user: managerSecret.username,
      password: managerSecret.password,
    };
  }

  /**
   * Creates r_reader and r_writer roles and normalize their defaults.
   * @param client
   * @param databaseName
   */
  public async createRole(client: Client, role: string): Promise<void> {
    try {
      const res = await client.query(`SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`, [role]);
      if (res.rowCount > 0) {
        console.log(`Role ${role} already exists. Skipping creation.`);
      } else {
        const sql = format('CREATE ROLE %I', role);
        console.log(`Running: ${sql}`);
        await client.query(sql);
      }
      const sql = format(`ALTER ROLE %I NOBYPASSRLS NOCREATEDB NOCREATEROLE NOLOGIN INHERIT`, role);
      console.log(`Running: ${sql}`);
      await client.query(sql);
    } catch (err) {
      console.log(`Failed creating roles: ${JSON.stringify(err)}`);
      throw err;
    }
  }

  /**
   * Create the database, if it doesn't already exist.
   * @param client
   * @param databaseName
   */
  public async createDatabase(client: Client, databaseName: string): Promise<void> {
    try {
      // Does the db already exist?
      const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
      if (res.rowCount > 0) {
        console.log(`Database ${databaseName} already exists.`);
        return;
      }
      const sql = format('CREATE DATABASE %I', databaseName);
      console.log(`Running: ${sql}`);
      await client.query(sql);
    } catch (err) {
      console.log(`Error creating database ${databaseName}: ${err}`);
    }
  }

  public async createSchema(client: Client, schemaName: string): Promise<void> {
    try {
      const sql = format(`CREATE SCHEMA IF NOT EXISTS %I`, schemaName);
      console.log(`Running: ${sql}`);
      await client.query(sql);
    } catch (err) {
      console.log(`Error creating schema ${schemaName}: ${err}`);
    }
  }

  /**
   * Configures the grants for a role.
   * @param client
   * @param databaseName
   * @param role
   * @param schemas
   */
  public async configureRole(client: Client, databaseName: string, role: string, schemas: string[]): Promise<void> {
    try {
      const isWriter = role == 'r_writer';
      [
        format('GRANT CONNECT ON DATABASE %I TO %I', databaseName, role), // Usage on Database
        ...schemas.map((s) => format('GRANT USAGE ON SCHEMA %I TO %I', s, role)), // Usage on Schema(s)
        format('ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO %I', role), // Defaults on sequences
        format(
          'ALTER DEFAULT PRIVILEGES GRANT SELECT%s ON TABLES TO %I',
          isWriter ? ', INSERT, UPDATE, DELETE' : '',
          role,
        ), // Defaults on tables
      ].map(async (sql) => {
        console.log(`Running: ${sql}`);
        return client.query(sql);
      });
    } catch (err) {
      console.log(`Failed creating roles: ${JSON.stringify(err)}`);
      throw err;
    }
  }
}
