import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClient,
  validateEnvironment,
} from '../.agents/skills/dataverse-web-api/dataverse-client.mjs';

test('normalizes a selected environment URL', () => {
  assert.deepEqual(
    validateEnvironment({ orgUrl: 'https://example.crm.dynamics.com///' }),
    { orgUrl: 'https://example.crm.dynamics.com', cloud: 'public' }
  );
});

test('rejects unsafe or incomplete environment URLs', () => {
  assert.throws(
    () => validateEnvironment({ orgUrl: 'http://example.crm.dynamics.com' }),
    /must use HTTPS/
  );
  assert.throws(
    () => validateEnvironment({ orgUrl: 'https://example.crm.dynamics.com/main.aspx' }),
    /must not include a path/
  );
  assert.throws(
    () => validateEnvironment({ orgUrl: 'https://user:password@example.crm.dynamics.com' }),
    /must not include credentials/
  );
});

test('rejects requests outside the selected environment Web API', async () => {
  const client = createClient({
    orgUrl: 'https://example.crm.dynamics.com',
    accessToken: 'test-token',
  });

  await assert.rejects(
    () => client.get('https://attacker.example/api/data/v9.2/accounts'),
    /must stay within the selected environment Web API/
  );
});

test('allows same-environment OData links and sends the bearer token', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response('{"value":[]}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = createClient({
      orgUrl: 'https://example.crm.dynamics.com',
      accessToken: 'test-token',
    });
    const result = await client.get(
      'https://example.crm.dynamics.com/api/data/v9.2/accounts?$top=1'
    );

    assert.equal(request.url, 'https://example.crm.dynamics.com/api/data/v9.2/accounts?$top=1');
    assert.equal(request.options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(result.data, { value: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not retain a failed request body on the error object', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('{"error":{"message":"Bad request"}}', {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

  try {
    const client = createClient({
      orgUrl: 'https://example.crm.dynamics.com',
      accessToken: 'test-token',
    });

    await assert.rejects(
      () => client.patch('/accounts(00000000-0000-0000-0000-000000000000)', { secret: 'value' }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.body, undefined);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});