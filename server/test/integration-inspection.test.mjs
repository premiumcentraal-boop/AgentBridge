import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectIntegration } from '../integration.mjs';

const env = {
  AGENTBRIDGE_BACKEND_URL: 'https://private.example/',
  AGENTBRIDGE_ACCOUNT_TOKEN: 'test-only-token-do-not-use',
};
const setup = {
  card_type: 'bridge_setup', mode: 'preview', routing_enabled: false,
  purchase_enabled: false, next_step: 'Ask the operator to assign a number.',
  state: 'not_assigned', bridge_number: null,
};
const owned = {
  card_type: 'owned_number', mode: 'preview', routing_enabled: false,
  purchase_enabled: false, numbers: [], state: 'not_confirmed',
};
function mockFetch(cards, requests) {
  return async (url, init) => {
    requests.push({ url: String(url), ...init });
    const rpc = JSON.parse(init.body);
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id: rpc.id,
      result: { structuredContent: cards[rpc.params.name] },
    }), { headers: { 'Content-Type': 'application/json' } });
  };
}
test('private MCP inspection only calls the two read-only tools and never claims a live route', async () => {
  const requests = [];
  const result = await inspectIntegration(env, mockFetch({
    get_bridge_setup: setup, list_my_numbers: owned,
  }, requests));
  assert.equal(result.status, 'connected');
  assert.match(result.message, /preview-only/);
  assert.equal(result.setup.state, 'not_assigned');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(r => JSON.parse(r.body).params.name),
    ['get_bridge_setup', 'list_my_numbers']);
  for (const request of requests) {
    assert.equal(request.url, 'https://private.example/mcp');
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, 'Bearer test-only-token-do-not-use');
    assert.deepEqual(JSON.parse(request.body).params.arguments, {});
  }
});
test('rejects unexpected, malformed or charge-enabled MCP cards instead of reporting a verified backend', async () => {
  const cases = [
    [{}, owned],
    [{ ...setup, routing_enabled: true }, owned],
    [{ ...setup, purchase_enabled: true }, owned],
    [{ ...setup, mode: 'live' }, owned],
    [{ ...setup, next_step: null }, owned],
    [setup, { ...owned, card_type: 'purchase_number' }],
    [setup, { ...owned, routing_enabled: true }],
    [setup, { ...owned, purchase_enabled: true }],
    [setup, { ...owned, numbers: {} }],
    [setup, { ...owned, mode: 'live' }],
  ];
  for (const [a, b] of cases) {
    const result = await inspectIntegration(env, mockFetch({
      get_bridge_setup: a, list_my_numbers: b,
    }, []));
    assert.equal(result.status, 'error', JSON.stringify([a, b]));
    assert.equal(result.setup, null);
    assert.deepEqual(result.numbers, []);
    assert.ok(!JSON.stringify(result).includes(env.AGENTBRIDGE_ACCOUNT_TOKEN));
  }
});
test('read-only provider error card never marks Studio connected', async () => {
  const result = await inspectIntegration(env, mockFetch({
    get_bridge_setup: setup,
    list_my_numbers: { card_type: 'number_error', mode: 'preview',
      purchase_enabled: false, routing_enabled: false, code: 'PROVIDER_LOOKUP_UNAVAILABLE' },
  }, []));
  assert.equal(result.status, 'error');
  assert.equal(result.setup, null);
  assert.deepEqual(result.numbers, []);
  assert.match(result.message, /number lookup failed/);
  assert.ok(!JSON.stringify(result).includes(env.AGENTBRIDGE_ACCOUNT_TOKEN));
});
test('rejects untrusted origins before sending a bearer token', async () => {
  for (const url of ['http://private.example/', 'https://user@private.example/',
    'https://private.example/path', 'https://private.example/?key=x',
    'https://private.example/#fragment']) {
    let requests = 0;
    const result = await inspectIntegration({ ...env, AGENTBRIDGE_BACKEND_URL: url },
      async () => { requests++; throw new Error('unexpected fetch'); });
    assert.equal(result.status, 'error', url);
    assert.equal(requests, 0, url);
  }
});
test('backend failure remains generic and does not disclose credentials or remote error bodies', async () => {
  const result = await inspectIntegration(env, async () =>
    new Response('remote private token test-only-token-do-not-use', { status: 502 }));
  assert.equal(result.status, 'error');
  assert.equal(result.setup, null);
  assert.ok(!JSON.stringify(result).includes('test-only-token-do-not-use'));
});

test('rejects mismatched, missing and malformed JSON-RPC response identifiers', async () => {
  for (const envelope of [
    { jsonrpc: '2.0', id: 999 },
    { jsonrpc: '2.0', id: '1' },
    { jsonrpc: '2.0' },
    { jsonrpc: '1.0', id: 1 },
    { id: 1 },
    null,
  ]) {
    let requests = 0;
    const result = await inspectIntegration(env, async (_url, init) => {
      requests++;
      const rpc = JSON.parse(init.body);
      const base = envelope === null ? null : { ...envelope, result: { structuredContent: setup } };
      return Response.json(rpc.id === 1 ? base : {
        jsonrpc: '2.0', id: rpc.id, result: { structuredContent: owned },
      });
    });
    assert.equal(result.status, 'error', JSON.stringify(envelope));
    assert.equal(requests, 1, 'invalid first response must prevent number lookup');
    assert.equal(result.setup, null);
    assert.ok(!JSON.stringify(result).includes(env.AGENTBRIDGE_ACCOUNT_TOKEN));
  }
});
