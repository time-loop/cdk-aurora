const { clickupCdk } = require('@time-loop/clickup-projen');

const bundledDeps = [];
const peerDeps = ['constructs@^10.0.5', 'multi-convention-namer@^0.1.11'];

const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: '@time-loop/cdk-aurora',

  cdkVersion: '2.17.0',
  defaultReleaseBranch: 'main',
  licensed: true,

  bundledDeps,
  deps: [...peerDeps, 'aws-lambda', 'aws-sdk', 'aws-xray-sdk-core'],
  devDeps: [...peerDeps, '@time-loop/clickup-projen', '@types/aws-lambda'],
  peerDeps,

  repositoryUrl: '', // leverage default
  authorName: '', // leverage default
  authorAddress: '', // leverage default
});
project.synth();
