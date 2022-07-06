import AWSMock from 'aws-sdk-mock';
import { Client } from 'pg';
import sinon from 'sinon';

import { Methods } from '../src/aurora.provision-user';

sinon.stub(console, 'log');

describe('fetchAndConformSecrets', () => {
  const m = new Methods();
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

  describe('without proxy', () => {
    it('updates user secret when missing engine', async () => {
      getSecretValueStub.onSecondCall().resolves({
        SecretString: JSON.stringify({
          password: 'userPassword',
          username: 'userUsername',
          host: 'userHost',
        }),
      });
      putSecretValueStub.onFirstCall().resolves({ $response: { error: undefined } });
      const r = await m.fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
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
      const r = await m.fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
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
      const r = await m.fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
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
      const r = await m.fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
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
      const r = await m.fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn');
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
      getSecretValueStub.onSecondCall().resolves({
        SecretString: JSON.stringify({
          password: 'userPassword',
          username: 'userUsername',
          engine: 'userEngine',
          host: 'userHost',
        }),
      });
      const r = await m.fetchAndConformSecrets('fakeManagerSecredArn', 'fakeUserSecretArn');
      expect(r).toEqual(standardResult);
      expect(putSecretValueStub.notCalled).toBe(true);
    });
  });

  describe('with proxy', () => {
    it('updates user secret to remove proxyHost if no proxyHost', async () => {
      getSecretValueStub.onSecondCall().resolves({
        SecretString: JSON.stringify({
          password: 'userPassword',
          username: 'userUsername',
          engine: 'userEngine',
          host: 'userHost',
          proxyHost: 'shouldNotBeHere',
        }),
      });
      const r = await m.fetchAndConformSecrets('fakeManagerSecredArn', 'fakeUserSecretArn');
      expect(r).toEqual(standardResult);
      expect(putSecretValueStub.callCount).toEqual(1);
    });

    it('updates user secret when missing proxy', async () => {
      getSecretValueStub.onSecondCall().resolves({
        SecretString: JSON.stringify({
          password: 'userPassword',
          username: 'userUsername',
          engine: 'userEngine',
          host: 'userHost',
        }),
      });
      const r = await m.fetchAndConformSecrets('fakeManagerSecredArn', 'fakeUserSecretArn', 'fakeProxyHost');
      expect(r).toEqual(standardResult);
      expect(putSecretValueStub.callCount).toEqual(1);
      expect(putSecretValueStub.firstCall.args[0]).toEqual({
        SecretId: 'fakeUserSecretArn',
        SecretString:
          '{"password":"userPassword","username":"userUsername","engine":"userEngine","host":"userHost","proxyHost":"fakeProxyHost"}',
      });
    });

    it('updates user secret when proxy changed', async () => {
      getSecretValueStub.onSecondCall().resolves({
        SecretString: JSON.stringify({
          password: 'userPassword',
          username: 'userUsername',
          engine: 'userEngine',
          host: 'userHost',
          proxyHost: 'oldProxyHost',
        }),
      });
      const r = await m.fetchAndConformSecrets('fakeManagerSecredArn', 'fakeUserSecretArn', 'fakeProxyHost');
      expect(r).toEqual(standardResult);
      expect(putSecretValueStub.callCount).toEqual(1);
      expect(putSecretValueStub.firstCall.args[0]).toEqual({
        SecretId: 'fakeUserSecretArn',
        SecretString:
          '{"password":"userPassword","username":"userUsername","engine":"userEngine","host":"userHost","proxyHost":"fakeProxyHost"}',
      });
    });
  });

  it('passes through errors on put', async () => {
    getSecretValueStub.onSecondCall().resolves({
      SecretString: JSON.stringify({
        password: 'userPassword',
        username: 'userUsername',
      }),
    });
    putSecretValueStub.onFirstCall().resolves({ $response: { error: new Error('whoopsie') } });
    await expect(m.fetchAndConformSecrets('fakeManagerSecretArn', 'fakeUserSecretArn')).rejects.toThrowError(
      'whoopsie',
    );
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

describe('postgres', () => {
  const m = new Methods();
  const postgresStub = sinon.stub(Client.prototype, 'query');
  const client = new Client();
  beforeEach(() => {
    postgresStub.reset();
  });

  describe('createUser', () => {
    it('skips if user already exists', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 1 }); // 1 because user is found
      postgresStub.onSecondCall().resolves({ rowCount: 0 });
      await m.createUser(client, 'fakeUsername');
      expect(postgresStub.callCount).toEqual(2); // only the check query, no query to create user, then conform
      expect(postgresStub.firstCall.args[1]).toEqual(['fakeUsername']);
      expect(postgresStub.secondCall.args[0]).toEqual('ALTER ROLE "fakeUsername" NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT');
    });

    it('creates user if user does not exist', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 0 }); // 0 because user is not found
      postgresStub.onSecondCall().resolves({ rowCount: 0 });
      postgresStub.onThirdCall().resolves({ rowCount: 0 });
      await m.createUser(client, 'fakeUsername');
      expect(postgresStub.callCount).toEqual(3); // check query and create user query
      expect(postgresStub.firstCall.args[1]).toEqual(['fakeUsername']);
      expect(postgresStub.secondCall.args[0]).toEqual('CREATE USER "fakeUsername" PASSWORD NULL');
      expect(postgresStub.thirdCall.args[0]).toEqual('ALTER ROLE "fakeUsername" NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT');
    });

    it('logs on error', async () => {
      postgresStub.onFirstCall().rejects(new Error('whoopsie'));
      await expect(m.createUser(client, 'fakeUsername')).rejects.toThrowError('whoopsie');
    });
  });

  describe('conformPassword', () => {
    it('conforms password', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 0 });
      await m.conformPassword(client, 'fakeUsername', 'fakePassword');
      expect(postgresStub.callCount).toEqual(1);
      expect(postgresStub.firstCall.args[0]).toEqual(
        'ALTER USER "fakeUsername" WITH ENCRYPTED PASSWORD \'fakePassword\'',
      );
    });

    it('logs on error', async () => {
      postgresStub.onFirstCall().rejects(new Error('whoopsie'));
      await expect(m.conformPassword(client, 'fakeUsername', 'fakePassword')).rejects.toThrowError('whoopsie');
    });
  });

  describe('grantRole', () => {
    it('grants for readers', async () => {
      postgresStub.resolves();
      await m.grantRole(client, 'fakeUsername', 'r_reader');
      expect(postgresStub.callCount).toEqual(1);
      expect(postgresStub.firstCall.args[0]).toEqual('GRANT r_reader TO "fakeUsername"');
    });

    it('grants for writers', async () => {
      postgresStub.resolves();
      await m.grantRole(client, 'fakeUsername', 'r_writer');
      expect(postgresStub.callCount).toEqual(1);
      expect(postgresStub.firstCall.args[0]).toEqual('GRANT r_writer TO "fakeUsername"');
    });

    // it('logs on error', async () => {
    //   postgresStub.onFirstCall().rejects(new Error('whoopsie'));
    //   await expect(m.grantPrivileges(client, 'fakeDbName', 'fakePassword', true)).rejects.toThrowError('whoopsie');
    // });

    it.todo('figure out why "logs on error" fails');
  });
});
