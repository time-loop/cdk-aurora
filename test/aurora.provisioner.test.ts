import AWSMock from 'aws-sdk-mock';
// import AWS from 'aws-sdk';
import { Client } from 'pg';
import sinon from 'sinon';

import {
  createUser,
  // conformPassword,
  fetchAndConformSecrets,
  //  grantPrivileges
} from '../src/aurora.provisioner';

describe('fetchAndConformSecrets', () => {
  const getSecretValueStub = sinon.stub();
  AWSMock.mock('SecretsManager', 'getSecretValue', getSecretValueStub);
  const putSecretValueSpy = sinon.spy();
  AWSMock.mock('SecretsManager', 'putSecretValue', putSecretValueSpy);

  const standardResult = {
    clientConfig: {
      host: 'managerHost',
      port: 'managerPort',
      user: 'managerUsername',
      password: 'managerPassword',
    },
    username: 'userUsername',
    password: 'userPassword',
  };

  beforeEach(() => {
    getSecretValueStub.resetHistory();
    putSecretValueSpy.resetHistory();
    // managerSecret
    getSecretValueStub.onFirstCall().resolves({
      SecretString: JSON.stringify({
        engine: 'managerEngine',
        host: 'managerHost',
        password: 'managerPassword',
        port: 'managerPort',
        username: 'managerUsername',
      }),
    });
  });

  it.todo('updates user secret when missing engine');
  it.todo('updates user secret when missing host');
  it('does not update user secret when both host and engine are already set', async () => {
    // userSecret
    getSecretValueStub.onSecondCall().returns({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        engine: 'userEngine',
        host: 'userHost',
      }),
    });
    const r = await fetchAndConformSecrets('fakeManagerSecredArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueSpy.notCalled).toBe(true);
  });
});

describe('createUser', () => {
  it.todo('skips if user already exists');
  it.todo('creates user if user does not exist');
  it.todo('logs on error');
});

describe('conformPassword', () => {
  it.todo('conforms password');
  it.todo('logs on error');
});

describe('grantPrivileges', () => {
  it.todo('grants for readers');
  it.todo('grants for writers');
  it.todo('logs on error');
});

describe('handler', () => {
  it.todo('runs onCreate');
  it.todo('runs onUpdate');
  it.todo('runs onDelete');
  it.todo('errors on unknown action');
});
