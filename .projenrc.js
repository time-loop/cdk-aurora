const { clickupCdk } = require('@time-loop/clickup-projen');
const project = new clickupCdk.ClickUpCdkConstructLibrary({
  name: '@time-loop/cdk-aurora',
  cdkVersion: '2.20.0',
  defaultReleaseBranch: 'main',
  devDeps: ['@time-loop/clickup-projen'],
  authorName: '', // leverage default
  authorAddress: '', // leverage default
  repositoryUrl: 'https://github.com/time-loop/cdk-aurora.git', // TODO: leverage default
});
project.synth();
