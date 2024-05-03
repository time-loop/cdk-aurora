import {
  RDSClient,
  DescribeDBClustersCommand,
  StartActivityStreamCommand,
  StopActivityStreamCommand,
} from '@aws-sdk/client-rds';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

const rdsClient = captureAWSv3Client(new RDSClient());

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

export interface IsCompleteEvent {
  LogicalResourceId: string,
  RequestId: string,
  ResourceType: string,
  ResponseURL: string,
  ResourceProperties?: { clusterId?: string, ServiceToken?: string },
  ServiceToken: string,
  StackId: string,

  PhysicalResourceId: string;
  RequestType: CfnRequestType;
}

interface CreateData {
  PhysicalResourceId: string;
}

interface BaseResultProps {
  Data?: CreateData;
  ReasonPrefix?: string;
}

interface CreateResultProps extends BaseResultProps {
  PhysicalResourceId: string;
  Status: CfnStatus;
}

interface DeleteResultProps extends BaseResultProps {}

export class Methods {
  /**
   * Given a clusterId, return the ARN of the Aurora Cluster.
   * @param clusterId
   * @returns
   */
  async getClusterArn(clusterId: string): Promise<string> {
    const describe = await rdsClient.send(
      new DescribeDBClustersCommand({ Filters: [{ Name: 'db-cluster-id', Values: [clusterId] }] }),
    );

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
  public async onCreate( event: any, logStreamName: string, invokedFunctionArn: string ): Promise<any> {
    const resultFactory = (props: CreateResultProps): any => {
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

    const result = await rdsClient.send(
      new StartActivityStreamCommand({
        ResourceArn,
        KmsKeyId: event.ResourceProperties.kmsKeyId,
        Mode: 'async',
        ApplyImmediately: true,
      }),
    );

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
  public async onUpdate( event: any, logStreamName: string ): Promise<any> {
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
  public async onDelete( event: any, logStreamName: string ): Promise<any> {
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

    const response = await // The `.promise()` call might be on an JS SDK v2 client API.
    // If yes, please remove .promise(). If not, remove this comment.
    rdsClient.send(new StopActivityStreamCommand({ ResourceArn: dbClusterArn, ApplyImmediately: true }));

    // Log it but don't risk locking the stack by checking it, for now.
    console.log(`stopActivityStream response: ${JSON.stringify(response)}`);
    return resultFactory();
  }
}

export const OnEvent = (
  event: any,
  context: any,
  _callback?: any,
): Promise<any> => {
  console.log(`onEvent event: ${JSON.stringify(event)}`);
  const m = new Methods();
  try {
    switch (event.RequestType) {
      case CfnRequestType.CREATE:
        return m.onCreate( event, context.logStreamName, context.invokedFunctionArn );
      case CfnRequestType.UPDATE:
        return m.onUpdate(event, context.logStreamName);
      case CfnRequestType.DELETE:
        return m.onDelete(event, context.logStreamName);
      default:
        return Promise.reject(`Unknown event RequestType in event ${event}`);
    }
  } catch (err) {
    console.error(err);
    return Promise.reject('Failed');
  }
};

export async function IsComplete(
  event: IsCompleteEvent,
  _context?: any,
  _callback?: any,
): Promise<IsCompleteResult> {
  console.log(`isComplete event: ${JSON.stringify(event)}`);

  if (event.RequestType == CfnRequestType.UPDATE) {
    return { IsComplete: true }; // update is a no-op
  }

  try {
    const result = await // The `.promise()` call might be on an JS SDK v2 client API.
    // If yes, please remove .promise(). If not, remove this comment.
    rdsClient.send(
      new DescribeDBClustersCommand({
        Filters: [{ Name: 'db-cluster-id', Values: [event.ResourceProperties!.clusterId!] }],
      }),
    );
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
