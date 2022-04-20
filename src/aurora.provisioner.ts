import * as awsLambda from 'aws-lambda';
import * as _awsSdk from 'aws-sdk';
import * as awsXray from 'aws-xray-sdk-core';
import pg;
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

export async function onCreate(
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

  const secretsManager = new awsSdk.SecretsManager();

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
  const managerSecretRaw = await secretsManager.getSecretValue({ SecretId: managerSecretArn }).promise();
  const managerSecret = JSON.parse(managerSecretRaw.SecretString!);

  const userSecretRaw = await secretsManager.getSecretValue({ SecretId: userSecretArn }).promise();
  const userSecret = JSON.parse(userSecretRaw.SecretString!);

  // Pull the host and engine information from the managerSecret and push it into the userSecret.
  var updatedUserSecret = false;
  if (!userSecret.hasOwnProperty('host')) {
    userSecret.host = managerSecret.host;
    updatedUserSecret = true;
  }
  if (!userSecret.host) {
    userSecret.host = managerSecret.host;
    updatedUserSecret = true;
  }
  if (!userSecret.hasOwnProperty('engine')) {
    userSecret.engine = managerSecret.engine;
    updatedUserSecret = true;
  }
  if (!userSecret.engine) {
    userSecret.engine = managerSecret.engine;
    updatedUserSecret = true;
  }

  const username = userSecret.username;

  // push secret, if updated
  if (!updatedUserSecret) {
    console.log(`User ${JSON.stringify(username)} secret already has host and engine information. Skipping update.`);
  } else {
    console.log(`Updating user secret for ${JSON.stringify(username)}`);
    const r = await secretsManager
      .putSecretValue({ SecretId: userSecretArn, SecretString: JSON.stringify(userSecret) })
      .promise();
    console.log(`putSecretValue ${userSecretArn} response: ${JSON.stringify(r)}`);
    if (r.$response.error) {
      return resultFactory({
        PhysicalResourceId: username,
        Status: CfnStatus.FAILED,
        ReasonPrefix: `Failed to update user secret: ${JSON.stringify(r.$response.error)}`,
      });
    }
  }
  return resultFactory({
    PhysicalResourceId: username,
    Status: CfnStatus.SUCCESS,
  });

  // const rds = new awsSdk.RDS({ region: 'us-east-1' });
  // const dbCluster = await rds.describeDBClusters({ DBClusterIdentifier: managerSecretJson.dbClusterIdentifier }).promise();
  // const dbClusterEndpoint = dbCluster.DBClusters[0].Endpoint;
  // const dbClusterEndpointAddress = dbClusterEndpoint.Address;
  // const dbClusterEndpointPort = dbClusterEndpoint.Port;

  // const db = new awsSdk.RDSDataService({
  //   endpoint: `${dbClusterEndpointAddress}:${dbClusterEndpointPort}`,
  // });

  //   const dbSecretArns = await Promise.all(userSecretArns.map(async (userSecretArn) => {
  //     const userSecret = await awsSdk.SecretsManager.getSecretValue({ SecretId: userSecretArn }).promise();
  //     const userSecretJson = JSON.parse(userSecret.SecretString);
  //     const userSecretArn = userSecretJson.secretArn;
  //     const userName = userSecretJson.userName;
  //     const userPassword = userSecretJson.userPassword;

  //     const dbSecretArn = await db.executeStatement({
  //       resourceArn: managerSecretArn,
  //       sql: `
  //         CREATE USER '${userName}' WITH PASSWORD '${userPassword}';
  //         GRANT ALL PR`
  // ):
}

/**
 * Currently a no-op. I don't think there's any value trying to do anything with this.
 * @param event
 * @param context
 * @param _callback
 * @returns
 */
export const onUpdate = async (
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
export const onDelete = async (
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
