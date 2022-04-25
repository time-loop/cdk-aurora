import * as awsLambda from 'aws-lambda';
import * as _awsSdk from 'aws-sdk';
import * as awsXray from 'aws-xray-sdk-core';
const awsSdk = awsXray.captureAWS(_awsSdk);

export interface ActivityStreamConstructProps {
  /**
   * The ARN of the Aurora Cluster where we should enable the ActivityStream
   */
  readonly clusterId: string;
  /**
   * The identifier of the kms key to be used to encrypt the stream.
   * Should be the same key used to encrypt the cluster.
   */
  readonly kmsKeyId: string;
}

enum CfnStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface IsCompleteResult {
  IsComplete: boolean;
}

export enum CfnRequestType {
  CREATE = 'Create',
  UPDATE = 'Update',
  DELETE = 'Delete',
}

export interface IsCompleteEvent extends awsLambda.CloudFormationCustomResourceEventCommon {
  PhysicalResourceId: string;
  RequestType: CfnRequestType;
}

interface CreateData {
  PhysicalResourceId: string;
}

interface CreateResultProps {
  Data?: CreateData;
  PhysicalResourceId: string;
  ReasonPrefix?: string;
  Status: CfnStatus;
}

interface DeleteResultProps {
  Data?: CreateData;
  ReasonPrefix?: string;
}

export class Methods {
  /**
   * Given a clusterId, return the ARN of the Aurora Cluster.
   * @param clusterId
   * @returns
   */
  async getClusterArn(clusterId: string): Promise<string> {
    const rds = new awsSdk.RDS();
    const describe = await rds
      .describeDBClusters({ Filters: [{ Name: 'db-cluster-id', Values: [clusterId] }] })
      .promise();

    if (!describe.DBClusters || describe.DBClusters.length < 1) {
      return 'Not found';
    }
    if (describe.DBClusters.length > 1) {
      return 'Multiple clusters found';
    }
    return describe.DBClusters[0].DBClusterArn || 'Undefined';
  }

  /**
   * Turn on the ActivityStream for the given cluster.
   * @param event
   * @param logStreamName
   * @param invokedFunctionArn
   * @returns
   */
  public async onCreate(
    event: awsLambda.CloudFormationCustomResourceCreateEvent,
    logStreamName: string,
    invokedFunctionArn: string,
  ): Promise<awsLambda.CloudFormationCustomResourceResponse> {
    const resultFactory = (props: CreateResultProps): awsLambda.CloudFormationCustomResourceResponse => {
      return {
        ...props,
        LogicalResourceId: event.LogicalResourceId,
        Reason: `${props?.ReasonPrefix} see also ${logStreamName}`,
        RequestId: event.RequestId,
        StackId: event.StackId,
      };
    };
    console.log(`onCreate event: ${JSON.stringify(event)}`);

    const ResourceArn = await this.getClusterArn(event.ResourceProperties.clusterId);
    if (!ResourceArn.startsWith('arn:aws:rds:')) {
      return resultFactory({
        PhysicalResourceId: 'none',
        ReasonPrefix: ResourceArn,
        Status: CfnStatus.FAILED,
      });
    }
    console.log(`dbClusterArn: ${ResourceArn}`);

    const rds = new awsSdk.RDS();
    const result = await rds
      .startActivityStream({
        ResourceArn,
        KmsKeyId: event.ResourceProperties.kmsKeyId,
        Mode: 'async',
        ApplyImmediately: true,
      })
      .promise();

    console.log(`startActivityStream: ${JSON.stringify(result)}`);

    // Parse the region & account number from invokedFunctionArn
    // https://stackoverflow.com/a/63734291
    const splits = invokedFunctionArn.split(':');
    const region = splits[3];
    const account = splits[4];
    const PhysicalResourceId = result.KinesisStreamName
      ? `arn:aws:kinesis:${region}:${account}:stream/${result.KinesisStreamName}`
      : 'none';

    return resultFactory({
      PhysicalResourceId,
      Status: result.Status?.startsWith('start') ? CfnStatus.SUCCESS : CfnStatus.FAILED,
      Data: { PhysicalResourceId },
    });
  }

  /**
   * We do nothing for updates.
   * @param event
   * @param logStreamName
   * @returns
   */
  public async onUpdate(
    event: awsLambda.CloudFormationCustomResourceUpdateEvent,
    logStreamName: string,
  ): Promise<awsLambda.CloudFormationCustomResourceResponse> {
    return {
      LogicalResourceId: event.LogicalResourceId,
      PhysicalResourceId: event.PhysicalResourceId,
      Reason: `See ${logStreamName}`,
      RequestId: event.RequestId,
      StackId: event.StackId,
      Status: CfnStatus.SUCCESS,
    };
  }

  /**
   * Turn off the ActivityStream for the given cluster.
   * NOTE: Delete always succeeds to avoid locking issues with CloudFormation.
   * @param event
   * @param logStreamName
   * @returns
   */
  public async onDelete(
    event: awsLambda.CloudFormationCustomResourceDeleteEvent,
    logStreamName: string,
  ): Promise<awsLambda.CloudFormationCustomResourceResponse> {
    const resultFactory = (props?: DeleteResultProps) => {
      return {
        Data: props?.Data,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: event.PhysicalResourceId,
        Reason: `${props?.ReasonPrefix} see also ${logStreamName}`,
        RequestId: event.RequestId,
        StackId: event.StackId,
        Status: CfnStatus.SUCCESS, // do not lock the stack.
      };
    };
    console.log(`onDelete event: ${JSON.stringify(event)}`);

    const dbClusterArn = await this.getClusterArn(event.ResourceProperties.clusterId);
    if (!dbClusterArn.startsWith('arn:aws:rds:')) {
      return resultFactory({
        ReasonPrefix: dbClusterArn,
      });
    }

    const rds = new awsSdk.RDS();
    const response = await rds.stopActivityStream({ ResourceArn: dbClusterArn, ApplyImmediately: true }).promise();

    // Log it but don't risk locking the stack by checking it, for now.
    console.log(`stopActivityStream response: ${JSON.stringify(response)}`);
    return resultFactory();
  }
}

export const OnEvent = (
  event: awsLambda.CloudFormationCustomResourceEvent,
  context: awsLambda.Context,
  _callback?: awsLambda.Callback,
): Promise<awsLambda.CloudFormationCustomResourceResponse> => {
  console.log(`onEvent event: ${JSON.stringify(event)}`);
  const m = new Methods();
  try {
    switch (event.RequestType) {
      case CfnRequestType.CREATE:
        return m.onCreate(
          event as awsLambda.CloudFormationCustomResourceCreateEvent,
          context.logStreamName,
          context.invokedFunctionArn,
        );
      case CfnRequestType.UPDATE:
        return m.onUpdate(event as awsLambda.CloudFormationCustomResourceUpdateEvent, context.logStreamName);
      case CfnRequestType.DELETE:
        return m.onDelete(event as awsLambda.CloudFormationCustomResourceDeleteEvent, context.logStreamName);
      default:
        return Promise.reject(`Unknown event RequestType in event ${event}`);
    }
  } catch (err) {
    console.error(err);
    return Promise.reject('Failed');
  }
};

export const IsComplete = async (
  event: IsCompleteEvent,
  _context?: awsLambda.Context,
  _callback?: awsLambda.Callback,
): Promise<IsCompleteResult> => {
  console.log(`isComplete event: ${JSON.stringify(event)}`);

  if (event.RequestType == CfnRequestType.UPDATE) {
    return { IsComplete: true }; // update is a no-op
  }

  try {
    const rds = new awsSdk.RDS();
    const result = await rds
      .describeDBClusters({ Filters: [{ Name: 'db-cluster-id', Values: [event.ResourceProperties.clusterId] }] })
      .promise();
    if (result.DBClusters?.length != 1) {
      return { IsComplete: true }; // can't find the cluster, so... I guess things are done?
    }
    const cluster = result.DBClusters[0];

    switch (event.RequestType) {
      case CfnRequestType.CREATE:
        return { IsComplete: cluster.ActivityStreamStatus == 'started' };
      case CfnRequestType.DELETE:
        return { IsComplete: cluster.ActivityStreamStatus == 'stopped' };
      default:
        return await Promise.reject(`Unknown event RequestType in ${JSON.stringify(event)}`);
    }
  } catch (err) {
    console.error(err);
    return Promise.reject('Failed');
  }
};
