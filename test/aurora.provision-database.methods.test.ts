import AWSMock from 'aws-sdk-mock';
import { Client, ClientConfig } from 'pg';
import sinon from 'sinon';

import { Methods } from '../src/aurora.provision-database';

sinon.stub(console, 'log');

describe('fetchSecret', () => {
  const m = new Methods();
  const getSecretValueStub = sinon.stub();
  AWSMock.mock('SecretsManager', 'getSecretValue', getSecretValueStub);

  const standardResult = {
    host: 'managerHost',
    port: 'managerPort',
    user: 'managerUsername',
    password: 'managerPassword',
  };

  beforeEach(() => {
    getSecretValueStub.reset();
    getSecretValueStub.resolves({
      SecretString: JSON.stringify({
        engine: 'managerEngine',
        host: 'managerHost',
        password: 'managerPassword',
        port: 'managerPort',
        username: 'managerUsername',
      }),
    });
  });

  it('succeeds', async () => {
    const r = await m.fetchSecret('fakeManagerSecretArn');
    expect(r).toEqual(standardResult);
    expect(getSecretValueStub.callCount).toEqual(1);
    expect(getSecretValueStub.firstCall.args[0]).toEqual({ SecretId: 'fakeManagerSecretArn' });
  });
});

describe('connect', () => {
  const m = new Methods();
  let connectStub: sinon.SinonStub;
  let queryStub: sinon.SinonStub;
  let setTimeoutStub: sinon.SinonStub;

  beforeEach(() => {
    connectStub = sinon.stub(Client.prototype, 'connect');
    queryStub = sinon.stub(Client.prototype, 'query');
    setTimeoutStub = sinon.stub(global, 'setTimeout');
  });

  afterEach(() => {
    connectStub.restore();
    queryStub.restore();
    setTimeoutStub.restore();
  });

  const standardClientConfig: ClientConfig = {
    host: 'managerHost',
    port: 5432,
    database: 'managerEngine',
  };

  it('succeeds', async () => {
    connectStub.resolves();
    queryStub.resolves({ rowCount: 1 }); // SELECT 1 should return 1 row.
    await m.connect(standardClientConfig);
    expect(connectStub.callCount).toEqual(1);
    expect(queryStub.callCount).toEqual(1);
  });

  // TODO: figure out how to stub these correctly?
  it.skip('retries when failing to connect', async () => {
    const maxRetries = 5;
    const retryDelayMs = 1;
    connectStub.rejects(new Error('whoopsie'));
    await expect(m.connect(standardClientConfig, { maxRetries, retryDelayMs })).rejects.toThrowError('whoopsie');
    expect(connectStub.callCount).toEqual(maxRetries + 1); // +1 because the first call is not a retry
    expect(queryStub.callCount).toEqual(0);
  });

  it.skip('retries when SELECT 1 fails', async () => {
    const maxRetries = 5;
    const retryDelayMs = 1;
    connectStub.resolves();
    queryStub.rejects(new Error('whoopsie'));
    await expect(m.connect(standardClientConfig, { maxRetries, retryDelayMs })).rejects.toThrowError('whoopsie');
    expect(connectStub.callCount).toEqual(maxRetries + 1);
    expect(queryStub.callCount).toEqual(maxRetries + 1);
  });

  it.skip('retries when SELECT 1 has rowcount != 1', async () => {
    const maxRetries = 5;
    const retryDelayMs = 1;
    connectStub.resolves();
    queryStub.resolves({ rowCount: 0 }); // SELECT 1 should return 1 row, but... ???
    await expect(m.connect(standardClientConfig, { maxRetries, retryDelayMs })).rejects.toThrowError(
      'expected 1 row, got 0',
    );
    expect(connectStub.callCount).toEqual(maxRetries + 1);
    expect(queryStub.callCount).toEqual(maxRetries + 1);
  });
});

describe('postgres', () => {
  const m = new Methods();
  const client = new Client();
  let postgresStub: sinon.SinonStub;

  beforeEach(() => {
    postgresStub = sinon.stub(Client.prototype, 'query');
  });

  afterEach(() => {
    postgresStub.restore();
  });

  describe('createRole', () => {
    it('skips if role already exists', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 1 }); // 1 because role is found
      postgresStub.onSecondCall().resolves({ rowCount: 0 });
      await m.createRole(client, 'fakeRoleName');
      expect(postgresStub.callCount).toEqual(2); // only the check query, and conform
      expect(postgresStub.firstCall.args[1]).toEqual(['fakeRoleName']);
      expect(postgresStub.secondCall.args[0]).toEqual(
        'ALTER ROLE "fakeRoleName" NOBYPASSRLS NOCREATEDB NOCREATEROLE NOLOGIN INHERIT',
      );
    });

    it('creates role if it does not exist', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 0 }); // 0 because role is not found
      postgresStub.onSecondCall().resolves({ rowCount: 1 }); // 1 because role is created
      postgresStub.onThirdCall().resolves({ rowCount: 0 });
      await m.createRole(client, 'fakeRoleName');
      expect(postgresStub.callCount).toEqual(3);
      expect(postgresStub.firstCall.args[1]).toEqual(['fakeRoleName']);
      expect(postgresStub.secondCall.args[0]).toEqual('CREATE ROLE "fakeRoleName"');
      expect(postgresStub.thirdCall.args[0]).toEqual(
        'ALTER ROLE "fakeRoleName" NOBYPASSRLS NOCREATEDB NOCREATEROLE NOLOGIN INHERIT',
      );
    });
  });

  describe('createDatabase', () => {
    it('skips if database already exists', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 1 }); // 1 because db is found
      await m.createDatabase(client, 'fakeDbName');
      expect(postgresStub.callCount).toEqual(1); // only the check query, no query to create database
      expect(postgresStub.firstCall.args[1]).toEqual(['fakeDbName']);
    });

    it('created database if it does not exist', async () => {
      postgresStub.onFirstCall().resolves({ rowCount: 0 }); // 0 because db is not found
      postgresStub.onSecondCall().resolves({ rowCount: 1 }); // 1 because db is created
      await m.createDatabase(client, 'fakeDbName');
      expect(postgresStub.callCount).toEqual(2);
      expect(postgresStub.firstCall.args[1]).toEqual(['fakeDbName']);
      expect(postgresStub.secondCall.args[0]).toEqual('CREATE DATABASE "fakeDbName"');
    });
  });

  describe('createSchema', () => {
    it('creates user if user does not exist', async () => {
      postgresStub.resolves();
      await m.createSchema(client, 'fakeSchema');
      expect(postgresStub.callCount).toEqual(1);
      expect(postgresStub.firstCall.args[0]).toEqual('CREATE SCHEMA IF NOT EXISTS "fakeSchema"');
    });

    it.todo('figure out "logs on error" test');
    // it('logs on error', async () => {
    //   postgresStub.rejects(new Error('whoopsie'));
    //   await expect(m.createSchema(client, 'fakeUsername')).rejects.toThrowError('whoopsie');
    // });
  });

  describe('configureRole', () => {
    it('grants for writers', async () => {
      [...Array(4).keys()].forEach((n) => postgresStub.onCall(n).resolves({ rowCount: 0 }));
      await m.configureRole(client, 'fakeDbName', 'r_writer', ['fakeSchema1', 'fakeSchema2']);
      const statements = [
        'GRANT CONNECT ON DATABASE "fakeDbName" TO r_writer',
        'GRANT USAGE ON SCHEMA "fakeSchema1" TO r_writer',
        'GRANT USAGE ON SCHEMA "fakeSchema2" TO r_writer',
        'ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO r_writer',
        'ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO r_writer',
      ];
      expect(postgresStub.callCount).toEqual(statements.length);
      statements.forEach((value, index) => expect(postgresStub.getCall(index).args[0]).toEqual(value));
    });

    it('grants for readers', async () => {
      [...Array(4).keys()].forEach((n) => postgresStub.onCall(n).resolves({ rowCount: 0 }));
      await m.configureRole(client, 'fakeDbName', 'r_reader', ['fakeSchema1', 'fakeSchema2']);
      const statements = [
        'GRANT CONNECT ON DATABASE "fakeDbName" TO r_reader',
        'GRANT USAGE ON SCHEMA "fakeSchema1" TO r_reader',
        'GRANT USAGE ON SCHEMA "fakeSchema2" TO r_reader',
        'ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO r_reader',
        'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO r_reader',
      ];
      expect(postgresStub.callCount).toEqual(statements.length);
      statements.forEach((value, index) => expect(postgresStub.getCall(index).args[0]).toEqual(value));
    });

    // it('logs on error', async () => {
    //   postgresStub.onFirstCall().rejects(new Error('whoopsie'));
    //   await expect(m.grantPrivileges(client, 'fakeDbName', 'fakePassword', true)).rejects.toThrowError('whoopsie');
    // });

    it.todo('figure out why "logs on error" fails');
  });
});
