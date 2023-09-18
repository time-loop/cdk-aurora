import { clickupCdk } from '@time-loop/clickup-projen';

// Pin SDK to 2.1333.0 because update looks like it breaks aws-sdk-mock
// The Right Thing to do here is to upgrade to sdk v3, but... that's a pile of work.
const bundledDeps = ['aws-lambda', 'aws-sdk@2.1333.0', 'aws-xray-sdk-core', 'pg', 'pg-format'];
const peerDeps = ['constructs@^10.0.5', 'multi-convention-namer@^0.1.12'];

const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: '@time-loop/cdk-aurora',

  cdkVersion: '2.94.0', // https://github.com/aws/aws-cdk/pull/26884 use modern python for rotator lambdas
  defaultReleaseBranch: 'main',
  licensed: true,
  workflowNodeVersion: '18.17.1',

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
