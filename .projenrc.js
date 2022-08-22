const { clickupCdk } = require('@time-loop/clickup-projen');

const bundledDeps = ['aws-lambda', 'aws-sdk', 'aws-xray-sdk-core', 'pg', 'pg-format'];
const peerDeps = ['constructs@^10.0.5', 'multi-convention-namer@^0.1.12'];

const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: '@time-loop/cdk-aurora',

  cdkVersion: '2.38.1',
  defaultReleaseBranch: 'main',
  licensed: true,

  bundledDeps,
  deps: [...bundledDeps],
  devDeps: [
    ...peerDeps,
    '@time-loop/clickup-projen',
    '@types/aws-lambda',
    '@types/pg',
    '@types/pg-format',
    '@types/sinon',
    'aws-sdk-mock',
    'sinon',
    'sinon-spy-utils',
  ],
  peerDeps,

  repositoryUrl: '', // leverage default
  authorName: '', // leverage default
  authorAddress: '', // leverage default
});
project.synth();
