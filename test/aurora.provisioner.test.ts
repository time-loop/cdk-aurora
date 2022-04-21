import AWSMock from 'aws-sdk-mock';
import { Client } from 'pg';
import sinon from 'sinon';

import {
  createUser,
  // conformPassword,
  fetchAndConformSecrets,
  //  grantPrivileges
} from '../src/aurora.provisioner';

sinon.stub(console, 'log');

describe('fetchAndConformSecrets', () => {
  const getSecretValueStub = sinon.stub();
  AWSMock.mock('SecretsManager', 'getSecretValue', getSecretValueStub);
  const putSecretValueStub = sinon.stub();
  AWSMock.mock('SecretsManager', 'putSecretValue', putSecretValueStub);

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
    putSecretValueStub.resetHistory();
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

  it('updates user secret when missing engine', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        host: 'userHost',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: undefined } });
    const r = await fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueStub.callCount).toEqual(1);
    expect(putSecretValueStub.firstCall.args[0]).toEqual({
      SecretId: 'fakeUserSecretArn',
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        host: 'userHost',
        engine: 'managerEngine',
      }),
    });
  });

  it('updates user secret when empty engine', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        host: 'userHost',
        engine: '',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: undefined } });
    const r = await fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueStub.callCount).toEqual(1);
    expect(putSecretValueStub.firstCall.args[0]).toEqual({
      SecretId: 'fakeUserSecretArn',
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        host: 'userHost',
        engine: 'managerEngine',
      }),
    });
  });

  it('updates user secret when missing host', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        engine: 'userEngine',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: undefined } });
    const r = await fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueStub.callCount).toEqual(1);
    expect(putSecretValueStub.firstCall.args[0]).toEqual({
      SecretId: 'fakeUserSecretArn',
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        engine: 'userEngine',
        host: 'managerHost',
      }),
    });
  });

  it('updates user secret when empty host', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        engine: 'userEngine',
        host: '',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: undefined } });
    const r = await fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueStub.callCount).toEqual(1);
    expect(putSecretValueStub.firstCall.args[0]).toEqual({
      SecretId: 'fakeUserSecretArn',
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        engine: 'userEngine',
        host: 'managerHost',
      }),
    });
  });

  it('updates user secret when missing both engine and host', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: undefined } });
    const r = await fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueStub.callCount).toEqual(1);
    expect(putSecretValueStub.firstCall.args[0]).toEqual({
      SecretId: 'fakeUserSecretArn',
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        host: 'managerHost',
        engine: 'managerEngine',
      }),
    });
  });

  it('does not update user secret when both host and engine are already set', async () => {
    // userSecret
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        engine: 'userEngine',
        host: 'userHost',
      }),
    });
    const r = await fetchAndConformSecrets('fakeManagerSecredArn', 'fakeUserSecretArn');
    expect(r).toEqual(standardResult);
    expect(putSecretValueStub.notCalled).toBe(true);
  });

  it('passes through errors on put', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: new Error('whoopsie') } });

    await expect(fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn')).rejects.toThrowError('whoopsie');

    expect(putSecretValueStub.callCount).toEqual(1);
    expect(putSecretValueStub.firstCall.args[0]).toEqual({
      SecretId: 'fakeUserSecretArn',
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
        host: 'managerHost',
        engine: 'managerEngine',
      }),
    });
  });
});

describe('createUser', () => {
  const postgresStub = sinon.stub(Client.prototype, 'query');
  const client = new Client();
  beforeEach(() => {
    postgresStub.resetHistory();
  });

  it('skips if user already exists', async () => {
    postgresStub.onFirstCall().resolves({ rowCount: 1 }); // 1 because user is found
    await createUser(client, 'fakeUsername');
    expect(postgresStub.callCount).toEqual(1); // only the check query, no query to create user
    expect(postgresStub.firstCall.args[1]).toEqual(['fakeUsername']);
  });

  it('creates user if user does not exist', async () => {
    postgresStub.onFirstCall().resolves({ rowCount: 0 }); // 0 because user is not found
    postgresStub.onSecondCall().resolves({ rowCount: 0 });
    await createUser(client, 'fakeUsername');
    expect(postgresStub.callCount).toEqual(2); // check query and create user query
    expect(postgresStub.firstCall.args[1]).toEqual(['fakeUsername']);
    expect(postgresStub.secondCall.args[0]).toEqual('CREATE USER "fakeUsername" NOINHERIT PASSWORD NULL');
  });

  it('logs on error', async () => {
    postgresStub.onFirstCall().rejects(new Error('whoopsie'));
    await expect(createUser(client, 'fakeUsername')).rejects.toThrowError('whoopsie');
  });
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
