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
      if (data.error || data.result?.isError || !data.result) throw new Error();
      return data.result.structuredContent ?? data.result;
    };
    const setup = await call('get_bridge_setup', 1);
    const numbers = await call('list_my_numbers', 2);
    return { status: 'connected', message: 'Private backend responded. Number discovery is read-only; live calling is not enabled by this studio.', setup, numbers, mcp_url: new URL('/mcp', base).href };
  } catch {
    // Never echo provider errors: they may contain a token, host, or carrier data.
    return { status: 'error', message: 'Backend could not be verified. Check the server URL, account token and backend health.', setup: null, numbers: [] };
  }
}
