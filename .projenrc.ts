import { clickupCdk } from '@time-loop/clickup-projen';
import { JsonPatch } from 'projen';

const bundledDeps = ['aws-lambda', 'aws-sdk', 'aws-xray-sdk-core', 'pg', 'pg-format'];
const peerDeps = ['constructs@^10.0.5', 'multi-convention-namer@^0.1.12'];

const repoName = 'cdk-aurora';
const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: `@time-loop/${repoName}`,

  cdkVersion: '2.78.0', // https://github.com/aws/aws-cdk/pull/25347 add missing PerformanceInsightRetention options
  defaultReleaseBranch: 'main',
  licensed: true,

  bundledDeps,
  deps: [...bundledDeps],
  devDeps: [
    '@aws-cdk/integ-tests-alpha',
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

  // integrationTestAutoDiscover: true, // default
  projenrcTs: true,
  author: '', // leverage default
  repositoryUrl: '', // leverage default
  authorAddress: '', // leverage default
});

// Tweak to force single package version everywhere for dev
const packageJson = project.tryFindObjectFile('package.json');
packageJson?.addOverride('resolutions', { 'projen': '0.71.67' });

// Assume the usInfraDev role
const build = project.tryFindObjectFile('.github/workflows/build.yml');
build?.addOverride('jobs.build.permissions', { 'id-token': 'write' });
build?.patch(
  JsonPatch.add('/jobs/build/steps/0', {
    name: 'Configure AWS Credentials',
    uses: 'aws-actions/configure-aws-credentials@v2',
    with: {
      'aws-region': 'us-east-1',
      'role-to-assume': `arn:aws:iam::425845004253:role/${repoName}-github-actions-role`,
      'role-duration-seconds': 900,
    },
  }),
);

project.synth();
