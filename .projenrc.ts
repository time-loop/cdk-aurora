import { clickupCdk } from '@time-loop/clickup-projen';

const bundledDeps = ['aws-lambda', 'aws-sdk', 'aws-xray-sdk-core', 'pg', 'pg-format'];
const peerDeps = ['constructs@^10.0.5', 'multi-convention-namer@^0.1.12'];

const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: '@time-loop/cdk-aurora',

  cdkVersion: '2.78.0', // https://github.com/aws/aws-cdk/pull/25347 add missing PerformanceInsightRetention options
  jsiiVersion: '5.0.*',
  defaultReleaseBranch: 'main',
  licensed: true,

  bundledDeps,
  deps: [...bundledDeps],
  devDeps: [
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
  projenrcTs: true,

  author: '', // leverage default
  repositoryUrl: '', // leverage default
  authorAddress: '', // leverage default
});
project.synth();
