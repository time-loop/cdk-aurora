import {} from '@aws-sdk/client-secretsmanager';

import { createUser, conformPassword, grantPrivileges } from '../src/aurora.provisioner';

describe('createUser', () => {
  it('skips if user already exists', async () => {});
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
