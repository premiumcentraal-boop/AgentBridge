import { readBoundedWebhookBody } from '../backend/src/bounded-body.mjs';

// No user-supplied URLs, redirects, arbitrary MCP tools, or write operations.
export async function inspectIntegration(env, fetcher = fetch) {
  if (!env.AGENTBRIDGE_BACKEND_URL || !env.AGENTBRIDGE_ACCOUNT_TOKEN) {
    return { status: 'not_configured', message: 'Connect a private AgentBridge backend to inspect your assigned number.', setup: null, numbers: [] };
  }
  let base;
  try {
    base = new URL(env.AGENTBRIDGE_BACKEND_URL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error();
  } catch {
    return { status: 'error', message: 'The backend URL must be an HTTPS origin, without a path or credentials.', setup: null, numbers: [] };
  }
  try {
    const call = async (name, id) => {
      const response = await fetcher(new URL('/mcp', base), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.AGENTBRIDGE_ACCOUNT_TOKEN },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } }),
      });
      const text = await readBoundedWebhookBody(response, 64_000);
      if (!response.ok || text === null) throw new Error();
      const data = JSON.parse(text);
      // Bind each response to its request: an unrelated or malformed JSON-RPC
      // reply must never be accepted as successful private backend inspection.
      if (!data || data.jsonrpc !== '2.0' || data.id !== id ||
          data.error || data.result?.isError || !data.result) throw new Error();
      return data.result.structuredContent ?? data.result;
    };
    // Validate setup before sending another authenticated request to the backend.
    // An invalid first card must fail closed without attempting number discovery.
    const preview = value => value && typeof value === 'object' && !Array.isArray(value) &&
      value.mode === 'preview' && value.routing_enabled === false &&
      value.purchase_enabled === false;
    const setup = await call('get_bridge_setup', 1);
    if (!preview(setup) || setup.card_type !== 'bridge_setup' ||
        typeof setup.next_step !== 'string' || !setup.next_step.trim()) throw new Error('INVALID_SETUP_CARD');
    const numbers = await call('list_my_numbers', 2);
    if (!preview(numbers) || !['owned_number', 'number_error'].includes(numbers.card_type) ||
        !(numbers.card_type === 'number_error' || Array.isArray(numbers.numbers))) throw new Error('INVALID_NUMBER_CARD');
    // A valid read-only error card proves the backend responded, but not that
    // number inventory succeeded. Never paint the Studio as connected on this path.
    if (numbers.card_type === 'number_error') {
      return { status: 'error', message: 'Private backend responded, but assigned-number lookup failed. Check provider access and retry.', setup: null, numbers: [] };
    }
    // Producer contract: empty inventory is a valid setup state, not a verified DID.
    const validDid = value => typeof value === 'string' &&
      /^\\+1[2-9]\\d{2}[2-9]\\d{6}$/.test(value);
    if (numbers.numbers.length > 10 ||
        !['project_inventory_match', 'incomplete_inventory', 'not_confirmed', 'operator_connection_required'].includes(numbers.state) ||
        numbers.numbers.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
          !validDid(item.number) || item.voice !== true ||
          item.ownership !== 'matched_in_operator_project' || item.routing_enabled !== false) ||
        new Set(numbers.numbers.map(item => item.number)).size !== numbers.numbers.length) {
      throw new Error('INVALID_NUMBER_INVENTORY');
    }
    const matched = numbers.state === 'project_inventory_match' &&
      numbers.numbers.length === 1 && validDid(setup.bridge_number) &&
      numbers.numbers[0].number === setup.bridge_number &&
      setup.state === 'assigned_unverified';
    if (numbers.numbers.length && !matched) throw new Error('INCONSISTENT_NUMBER_INVENTORY');
    if (!matched) {
      return { status: 'needs_setup', message: 'Private backend is reachable, but no assigned US number was confirmed in the read-only project inventory. Complete setup and retry. Live calling remains disabled.', setup, numbers, mcp_url: new URL('/mcp', base).href };
    }
    return { status: 'connected', message: 'Assigned US number matched the operator project inventory. Carrier ownership, live calling and routing authorization are not verified.', setup, numbers, mcp_url: new URL('/mcp', base).href };
  } catch {
    // Never echo provider errors: they may contain a token, host, or carrier data.
    return { status: 'error', message: 'Backend could not be verified. Check the server URL, account token and backend health.', setup: null, numbers: [] };
  }
}
