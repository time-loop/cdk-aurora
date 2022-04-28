export function clusterArn(region: string, accountId: string, clusterId: string): string {
  return `arn:aws:rds:${region}:${accountId}:cluster:${clusterId}`;
}
