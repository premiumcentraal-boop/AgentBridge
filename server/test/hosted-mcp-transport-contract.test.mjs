import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { sha256 } from '../../backend/src/index.mjs';
import { inspectIntegration } from '../integration.mjs';

// Exercise the actual Cloudflare Worker /mcp entrypoint, not a fabricated
// JSON-RPC response. No carrier credentials, network or database writes.
const TOKEN = 'ab_' + 'q'.repeat(48);
const DID = '+12025550123';
const origin = 'https://bridge.example/';
async function fixture() {
  const digest = await sha256(TOKEN);
  const sql = [];
  const env = {
    US_BRIDGE_DID: DID,
    DB: { prepare(query) {
      sql.push(query);
      assert.match(query, /^SELECT id, did, status FROM accounts WHERE api_key_sha256 = \?$/);
      return { bind(hash) { return { first: async () =>
        hash === digest ? { id: 'test-account', did: DID, status: 'active' } : null }; } };
    } },
  };
  const requests = [];
  const fetcher = async (url, init) => {
    assert.equal(String(url), 'https://bridge.example/mcp');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    const rpc = JSON.parse(init.body);
    requests.push({ rpc, authorization: init.headers.Authorization });
    return worker.fetch(new Request(String(url), init), env);
  };
  return { env, fetcher, requests, sql };
}

test('real hosted Worker MCP transport passes truthful read-only cards to Studio', async () => {
  const f = await fixture();
  const result = await inspectIntegration({
    AGENTBRIDGE_BACKEND_URL: origin,
    AGENTBRIDGE_ACCOUNT_TOKEN: TOKEN,
  }, f.fetcher);
  assert.equal(result.status, 'needs_setup');
  assert.equal(result.setup.card_type, 'bridge_setup');
  assert.equal(result.setup.routing_enabled, false);
  assert.equal(result.setup.purchase_enabled, false);
  assert.equal(result.numbers.card_type, 'owned_number');
  assert.deepEqual(result.numbers.numbers, []);
  assert.deepEqual(f.requests.map(r => [r.rpc.id, r.rpc.method, r.rpc.params.name]), [
    [1, 'tools/call', 'get_bridge_setup'],
    [2, 'tools/call', 'list_my_numbers'],
  ]);
  assert.ok(f.requests.every(r => r.authorization === 'Bearer ' + TOKEN));
  assert.ok(f.sql.every(s => s.startsWith('SELECT ')));
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('real hosted Worker MCP rejects bad authentication before any account disclosure', async () => {
  const f = await fixture();
  const result = await inspectIntegration({
    AGENTBRIDGE_BACKEND_URL: origin,
    AGENTBRIDGE_ACCOUNT_TOKEN: 'ab_' + 'x'.repeat(48),
  }, f.fetcher);
  assert.equal(result.status, 'error');
  assert.equal(result.setup, null);
  assert.equal(f.requests.length, 1);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('real hosted Worker rejects unknown tools and malformed RPC without carrier activity', async () => {
  const f = await fixture();
  for (const payload of [
    { jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'purchase_number', arguments: {} } },
    { jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'get_bridge_setup', arguments: { token: 'unsafe' } } },
    { jsonrpc: '1.0', id: 9, method: 'tools/call',
      params: { name: 'get_bridge_setup', arguments: {} } },
  ]) {
    const response = await worker.fetch(new Request('https://bridge.example/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json',
        authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(payload),
    }), f.env);
    const data = await response.json();
    assert.equal(data.jsonrpc, '2.0');
    assert.equal(data.id, payload.id);
    assert.ok(data.error, JSON.stringify(data));
    assert.ok(!JSON.stringify(data).includes(TOKEN));
  }
  assert.ok(f.sql.every(s => s.startsWith('SELECT ')));
});


test('combined Worker MCP and Studio fail closed on ambiguous SignalWire pagination', { concurrency: false }, async () => {
  const f = await fixture();
  const secret = 'synthetic-provider-secret-never-display';
  Object.assign(f.env, {
    SIGNALWIRE_SPACE: 'offline-space',
    SIGNALWIRE_PROJECT_ID: '271cda55-9a69-4513-b6de-67271d08b9bf',
    SIGNALWIRE_API_TOKEN: secret,
  });
  const originalFetch = globalThis.fetch;
  const cases = [
    { name: 'terminal match', data: [{ number: DID, capabilities: ['voice'] }], links: { next: null }, expected: 'connected' },
    { name: 'duplicate matching DID', data: [{ number: DID, capabilities: ['voice'] }, { number: DID, capabilities: ['voice'] }], links: { next: null }, expected: 'needs_setup' },
    { name: 'matching and unrelated DID', data: [{ number: DID, capabilities: ['voice'] }, { number: '+12025550124', capabilities: ['voice'] }], links: { next: null }, expected: 'needs_setup' },
    { name: 'matching DID with continuation', data: [{ number: DID, capabilities: ['voice'] }], links: { next: 'page-two' }, expected: 'needs_setup' },
    { name: 'missing links', data: [{ number: DID, capabilities: ['voice'] }], expected: 'needs_setup' },
    { name: 'missing next', data: [{ number: DID, capabilities: ['voice'] }], links: {}, expected: 'needs_setup' },
    { name: 'false continuation', data: [{ number: DID, capabilities: ['voice'] }], links: { next: false }, expected: 'needs_setup' },
    { name: 'full page', data: Array.from({ length: 10 }, () => ({ number: DID, capabilities: ['voice'] })), links: { next: null }, expected: 'needs_setup' },
    { name: 'provider unavailable', status: 503, expected: 'error' },
  ];
  try {
    for (const scenario of cases) {
      const providerRequests = [];
      globalThis.fetch = async (url, options) => {
        providerRequests.push({ url: String(url), options });
        assert.equal(options.method, 'GET', scenario.name);
        assert.equal(options.redirect, 'error', scenario.name);
        assert.equal(new URL(String(url)).hostname, 'offline-space.signalwire.com');
        assert.equal(new URL(String(url)).searchParams.get('filter_number'), DID);
        return scenario.status
          ? new Response('secret upstream failure', { status: scenario.status })
          : Response.json({ data: scenario.data, ...(Object.hasOwn(scenario, 'links') ? { links: scenario.links } : {}) });
      };
      const start = f.requests.length;
      const result = await inspectIntegration({
        AGENTBRIDGE_BACKEND_URL: origin,
        AGENTBRIDGE_ACCOUNT_TOKEN: TOKEN,
      }, f.fetcher);
      assert.equal(result.status, scenario.expected, scenario.name);
      assert.equal(f.requests.length - start, 2, scenario.name);
      assert.equal(providerRequests.length, 1, scenario.name);
      assert.ok(!JSON.stringify(result).includes(secret), scenario.name);
      assert.ok(!JSON.stringify(result).includes(TOKEN), scenario.name);
      assert.ok(!JSON.stringify(result).includes('secret upstream failure'), scenario.name);
      if (scenario.expected !== 'connected') {
        assert.ok(result.status !== 'connected', scenario.name);
      } else {
        assert.equal(result.numbers.numbers[0].number, DID);
        assert.equal(result.numbers.routing_enabled, false);
        assert.equal(result.numbers.purchase_enabled, false);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(f.sql.every(s => s.startsWith('SELECT ')));
});
