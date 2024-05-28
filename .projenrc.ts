import { clickupCdk } from '@time-loop/clickup-projen';
import { javascript } from 'projen';

const bundledDeps = ['@aws-sdk/client-rds', '@aws-sdk/client-secrets-manager', 'aws-xray-sdk-core', 'pg', 'pg-format'];
const peerDeps = ['constructs@^10.0.5', 'multi-convention-namer@^0.1.12'];

const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: '@time-loop/cdk-aurora',

  cdkVersion: '2.140.0', // custom-resources should be able to use latest sdk
  defaultReleaseBranch: 'main',
  licensed: true,
  packageManager: javascript.NodePackageManager.PNPM,
  pnpmVersion: '9',

  bundledDeps,
  deps: [...bundledDeps],
  devDeps: [
    '@time-loop/clickup-projen',
    '@types/pg',
    '@types/pg-format',
    '@types/sinon',
    'aws-sdk-client-mock',
    'sinon',
    'sinon-spy-utils',
  ],
  peerDeps,
  projenrcTs: true,

  author: '', // leverage default
  repositoryUrl: '', // leverage default
  authorAddress: '', // leverage default
});

project.npmrc.addConfig('node-linker', 'hoisted'); // PNPM support for bundledDeps https://pnpm.io/npmrc#node-linker

project.synth();
