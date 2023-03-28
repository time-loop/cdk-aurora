export function clusterArn(region: string, accountId: string, clusterId: string): string {
  return `arn:aws:rds:${region}:${accountId}:cluster:${clusterId}`;
}

export function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
