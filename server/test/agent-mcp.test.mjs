import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../app.mjs";
import { openStore } from "../store.mjs";
import { openAccountDatabase } from "../accounts/node-database.mjs";
import { emptyWorkspace } from "../accounts/model.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { signalWireFixture } from "./helpers/signalwire-fixture.mjs";
const origin = "https://agentbridge.test",
  email = "tester@example.com",
  invite = "mcp-test-only-invitation",
  password = "mcp-test-only-long-password";
const allScopes =
  "contacts:read contacts:write history:read calls:prepare calls:read outcomes:write calls:request";
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function harness(t, options = {}) {
  const database = openAccountDatabase(":memory:"),
    store = openStore(":memory:");
  let providerRequests = 0;
  const server = createApp({
    accountDatabase: database,
    store,
    env: {
      NODE_ENV: "production",
      STUDIO_PUBLIC_ORIGIN: origin,
      DEMO_TESTER_EMAIL: email,
      DEMO_SIGNUP_INVITE_SHA256: hash(invite),
      PROVIDER_CREDENTIALS_KEY: randomBytes(32).toString("hex"),
    },
    fetcher:
      options.fetcher ||
      (() => {
        providerRequests++;
        throw new Error("No carrier operation is allowed in this test");
      }),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const rawFetch = (input, options = {}) =>
    new Promise((resolve, reject) => {
      const url = new URL(String(input)),
        headers = Object.fromEntries(
          new Headers({
            Host: "agentbridge.test",
            ...Object.fromEntries(new Headers(options.headers || {})),
          }),
        );
      if (options.body)
        headers["content-length"] = String(
          Buffer.byteLength(String(options.body)),
        );
      const req = http.request(
        url,
        { method: options.method || "GET", headers },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () =>
            resolve(
              new Response(
                response.statusCode === 204 || response.statusCode === 304
                  ? null
                  : Buffer.concat(chunks),
                { status: response.statusCode, headers: response.headers },
              ),
            ),
          );
        },
      );
      req.on("error", reject);
      if (options.body)
        req.write(
          typeof options.body === "string"
            ? options.body
            : options.body.toString(),
        );
      req.end();
    });
  const request = (path, options = {}) => rawFetch(base + path, options);
  const signup = await request("/api/auth/register", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      name: "Tester",
      agent_name: "My agent",
      password,
      invite_token: invite,
    }),
  });
  assert.equal(signup.status, 201, await signup.clone().text());
  const cookie = signup.headers.get("set-cookie").split(";")[0];
  const api = (path, method = "GET", body, session = cookie) =>
    request("/api/studio/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: session,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const register = async (name = "Test Grok") => {
    const response = await request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: ["https://client.example/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };
  const begin = async (client, scopes = allScopes) => {
    const verifier = randomBytes(32).toString("base64url"),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "test-state",
      scope: scopes,
      resource: origin + "/mcp",
    });
    const response = await request("/authorize?" + query);
    assert.equal(response.status, 302, await response.clone().text());
    return {
      verifier,
      request_id: new URL(response.headers.get("location")).searchParams.get(
        "authorize",
      ),
      client,
    };
  };
  const approve = async (flow, session = cookie) => {
    const response = await api(
      "agents/authorize",
      "POST",
      { request_id: flow.request_id, approved: true },
      session,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const redirect = new URL((await response.json()).redirect);
    assert.equal(redirect.searchParams.get("state"), "test-state");
    assert.equal(redirect.searchParams.get("iss"), origin + "/");
    return { ...flow, code: redirect.searchParams.get("code") };
  };
  const token = (flow, extra = {}) =>
    request("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: flow.client.client_id,
        code: flow.code,
        redirect_uri: flow.client.redirect_uris[0],
        code_verifier: flow.verifier,
        resource: origin + "/mcp",
        ...extra,
      }),
    });
  const connect = async (scopes = allScopes, session = cookie) => {
    const client = await register(),
      flow = await approve(await begin(client, scopes), session),
      response = await token(flow);
    assert.equal(response.status, 200, await response.clone().text());
    return { client, flow, tokens: await response.json() };
  };
  const sdk = async (access) => {
    const client = new Client({
      name: "AgentBridge-release-test",
      version: "1.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: { headers: { Authorization: "Bearer " + access } },
        fetch: rawFetch,
      }),
    );
    t.after(() => client.close());
    return client;
  };
  return {
    database,
    request,
    api,
    cookie,
    register,
    begin,
    approve,
    token,
    connect,
    sdk,
    providerRequests: () => providerRequests,
  };
}
const structured = (result) => {
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
};
test("real OAuth PKCE discovery connects the official MCP client, recognizes contacts and remembers an actual reported outcome", async (t) => {
  const h = await harness(t);
  const missing = await h.request("/mcp");
  assert.equal(missing.status, 401);
  assert.match(
    missing.headers.get("www-authenticate"),
    /oauth-protected-resource\/mcp/,
  );
  const metadata = await (
    await h.request("/.well-known/oauth-authorization-server")
  ).json();
  assert.equal(metadata.issuer, origin + "/");
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  const { tokens } = await h.connect();
  const client = await h.sdk(tokens.access_token);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 7);
  const saved = structured(
    await client.callTool({
      name: "save_contact",
      arguments: {
        name: "Alex",
        number: "(202) 555-0123",
        country: "US",
        notes: "Prefers afternoon appointments.",
      },
    }),
  );
  assert.equal(saved.contact.number, "+12025550123");
  let plan = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: {
        target: "+1 (202) 555-0123",
        purpose: "Confirm the viewing address",
      },
    }),
  );
  assert.equal(plan.known_contact, true);
  assert.equal(plan.call_started, false);
  assert.equal(plan.next_action, "native_confirmation_required");
  assert.equal(plan.brief.notes, "Prefers afternoon appointments.");
  assert.equal(plan.brief.total_previous_calls, 0);
  const outcome = structured(
    await client.callTool({
      name: "save_call_outcome",
      arguments: {
        prepared_call_id: plan.prepared_call_id,
        summary: "Alex confirmed the appointment for Tuesday.",
        follow_ups: ["Confirm reception access."],
        duration_seconds: 48,
      },
    }),
  );
  assert.equal(outcome.carrier_verified, false);
  plan = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: { target: "Alex" },
    }),
  );
  assert.equal(
    plan.brief.previous_calls[0].summary,
    "Alex confirmed the appointment for Tuesday.",
  );
  assert.equal(plan.brief.previous_calls[0].source, "agent_reported");
  assert.deepEqual(plan.brief.previous_calls[0].follow_ups, [
    "Confirm reception access.",
  ]);
  const history = structured(
    await client.callTool({
      name: "get_contact_history",
      arguments: { contact_id: saved.contact.id },
    }),
  );
  assert.equal(history.calls.length, 1);
  assert.equal(history.calls[0].verified, false);
  const callbackAttempt = await client.callTool({
    name: "start_call",
    arguments: { prepared_call_id: plan.prepared_call_id },
  });
  assert.equal(callbackAttempt.isError, true);
  assert.match(callbackAttempt.content[0].text, /NATIVE_CALL_REQUIRED/);
  assert.equal(h.providerRequests(), 0);
  const database = await h.database.first(
    "SELECT token_hash FROM ab_agent_tokens LIMIT 1",
  );
  assert.notEqual(database.token_hash, tokens.access_token);
  assert.notEqual(
    (await h.database.first("SELECT code_hash FROM ab_agent_codes")).code_hash,
    tokens.access_token,
  );
});

test("confidential MCP clients can register and exchange with encrypted-at-rest client secrets", async (t) => {
  const h = await harness(t),
    response = await h.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Confidential Grok connector",
        redirect_uris: ["https://client.example/callback"],
        token_endpoint_auth_method: "client_secret_post",
      }),
    });
  assert.equal(response.status, 201, await response.clone().text());
  const client = await response.json();
  assert.match(client.client_secret, /^[a-f0-9]{64}$/);
  const row = await h.database.first(
    "SELECT metadata FROM ab_agent_clients WHERE client_id=?",
    [client.client_id],
  );
  assert.ok(!row.metadata.includes(client.client_secret));
  assert.match(row.metadata, /encrypted_client_secret/);
  const flow = await h.approve(await h.begin(client, "contacts:read"));
  const missingSecret = await h.token(flow);
  assert.equal(missingSecret.status, 400);
  assert.equal((await missingSecret.json()).error, "invalid_client");
  const tokens = await h.token(flow, { client_secret: client.client_secret });
  assert.equal(tokens.status, 200, await tokens.clone().text());
  const sdk = await h.sdk((await tokens.json()).access_token);
  assert.equal((await sdk.listTools()).tools.length, 1);
});

test("a paid MCP callback needs separate owner approval and dispatches only once with the durable request", async (t) => {
  const provider = signalWireFixture(),
    h = await harness(t, { fetcher: provider.fetcher });
  const checked = async (path, method = "GET", body) => {
    const response = await h.api(path, method, body);
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  await checked("provider/credentials", "POST", provider.config());
  await checked("provider/mode", "PATCH", { live_enabled: true });
  const { number } = await checked("live/numbers/import", "POST", {
    provider_number_id: provider.owned.id,
    label: "Office",
  });
  await checked("live/connections", "POST", {
    label: "Alex",
    country: "US",
    destination: "+12025550123",
    routing_number_id: number.id,
  });
  const { tokens } = await h.connect(),
    client = await h.sdk(tokens.access_token);
  const plan = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: {
        target: "Alex",
        transport: "callback",
        purpose: "Confirm appointment",
      },
    }),
  );
  assert.equal(plan.next_action, "studio_approval_required");
  assert.equal(provider.state.calls.length, 0);
  const invoke = () =>
    client.callTool({
      name: "start_call",
      arguments: { prepared_call_id: plan.prepared_call_id },
    });
  const denied = await invoke();
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /OWNER_APPROVAL_REQUIRED/);
  assert.equal(
    (
      await h.api(
        "agents/calls/" + plan.prepared_call_id + "/approve",
        "POST",
        { callback_number: "+12025550124", confirm_charges: false },
      )
    ).status,
    422,
  );
  await checked("agents/calls/" + plan.prepared_call_id + "/approve", "POST", {
    callback_number: "+12025550124",
    confirm_charges: true,
  });
  const result = structured(await invoke());
  assert.equal(result.source, "signalwire");
  assert.equal(provider.state.calls.length, 1);
  structured(await invoke());
  assert.equal(provider.state.calls.length, 1);
  const providerCall = provider
    .posts()
    .find((item) => item.path.endsWith("/Calls"));
  assert.equal(providerCall.body.To, "+12025550124");
  assert.equal(providerCall.body.TimeLimit, "300");
  provider.state.calls[0].status = "completed";
  const status = structured(
    await client.callTool({
      name: "get_call_status",
      arguments: { prepared_call_id: plan.prepared_call_id },
    }),
  );
  assert.equal(status.status, "completed");
  assert.equal(status.carrier_verified, true);
});
test("PKCE, code binding, resource audience and one-use authorization protect token issuance", async (t) => {
  const h = await harness(t),
    client = await h.register(),
    flow = await h.approve(await h.begin(client));
  assert.equal(
    (
      await h.token(flow, {
        code_verifier: randomBytes(32).toString("base64url"),
      })
    ).status,
    400,
  );
  assert.equal(
    (await h.token(flow, { resource: "https://other.example/mcp" })).status,
    400,
  );
  assert.equal(
    (await h.token(flow, { redirect_uri: "https://evil.example/callback" }))
      .status,
    400,
  );
  const responses = await Promise.all([h.token(flow), h.token(flow)]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 400],
  );
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_agent_tokens")).n,
    2,
  );
  const forged = await h.request(
    "/authorize?" +
      new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: "https://evil.example/callback",
        response_type: "code",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
      }),
  );
  assert.equal(forged.status, 400);
  assert.equal(forged.headers.get("location"), null);
  const host = await h.request("/.well-known/oauth-authorization-server", {
    headers: { Host: "evil.example" },
  });
  assert.equal(host.status, 421);
});
test("refresh tokens rotate, replay revokes the grant and users can disconnect apps immediately", async (t) => {
  const h = await harness(t),
    connected = await h.connect("contacts:read calls:read");
  const refresh = (refreshToken) =>
    h.request("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: connected.client.client_id,
        refresh_token: refreshToken,
        resource: origin + "/mcp",
      }),
    });
  const response = await refresh(connected.tokens.refresh_token);
  assert.equal(response.status, 200, await response.clone().text());
  const next = await response.json();
  assert.notEqual(next.refresh_token, connected.tokens.refresh_token);
  assert.equal((await refresh(connected.tokens.refresh_token)).status, 400);
  assert.equal(
    (
      await h.request("/mcp", {
        headers: { Authorization: "Bearer " + next.access_token },
      })
    ).status,
    401,
  );
  const second = await h.connect("contacts:read");
  const grants = await (await h.api("agents")).json();
  const grant = grants.grants.find((item) => !item.revoked_at);
  const revoked = await h.api("agents/grants/" + grant.id, "DELETE", {});
  assert.equal(revoked.status, 200, await revoked.clone().text());
  assert.equal(
    (
      await h.request("/mcp", {
        headers: { Authorization: "Bearer " + second.tokens.access_token },
      })
    ).status,
    401,
  );
});
test("scope-limited tools never expose another account, demo records or an unapproved paid action", async (t) => {
  const h = await harness(t),
    { tokens } = await h.connect();
  const client = await h.sdk(tokens.access_token);
  const owner = structured(
    await client.callTool({
      name: "save_contact",
      arguments: {
        name: "Private contact",
        number: "+12025550124",
        notes: "Private history note",
      },
    }),
  );
  const plan = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: { target: "Private contact" },
    }),
  );
  const stamp = new Date().toISOString(),
    other = randomUUID(),
    session = randomBytes(32).toString("hex");
  await h.database.batch([
    {
      sql: "INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      params: [
        other,
        "other@example.com",
        "Other",
        "Other agent",
        "password",
        stamp,
        stamp,
      ],
    },
    {
      sql: "INSERT INTO ab_workspaces(account_id,revision,document,updated_at) VALUES(?,0,?,?)",
      params: [other, JSON.stringify(emptyWorkspace()), stamp],
    },
    {
      sql: "INSERT INTO ab_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)",
      params: [hash(session), other, Date.now() + 3600000, stamp],
    },
  ]);
  const otherCookie = "ab_customer=" + session,
    otherConnection = await h.connect(allScopes, otherCookie),
    otherClient = await h.sdk(otherConnection.tokens.access_token);
  const missing = await otherClient.callTool({
    name: "get_contact_history",
    arguments: { contact_id: owner.contact.id },
  });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /CONTACT_NOT_FOUND/);
  assert.equal(
    (
      await h.api(
        "agents/calls/" + plan.prepared_call_id,
        "GET",
        undefined,
        otherCookie,
      )
    ).status,
    404,
  );
  const foreign = await otherClient.callTool({
    name: "save_call_outcome",
    arguments: { prepared_call_id: plan.prepared_call_id, summary: "Forged" },
  });
  assert.equal(foreign.isError, true);
  const read = await h.connect("contacts:read");
  const readClient = await h.sdk(read.tokens.access_token);
  const list = await readClient.listTools();
  assert.deepEqual(
    list.tools.map((tool) => tool.name),
    ["get_agentbridge_setup"],
  );
  const forbidden = await readClient.callTool({
    name: "save_contact",
    arguments: { name: "Injected", number: "+12025550125" },
  });
  assert.equal(forbidden.isError, true);
  const demo = await h.api("number-orders", "POST", {
    request_id: randomUUID(),
    provider: "signalwire",
    country: "US",
    area_code: "202",
    label: "Demo",
    candidate: "+12025550130",
  });
  assert.equal(demo.status, 201);
  const number = (await demo.json()).number;
  assert.equal(
    (
      await h.api("connections", "POST", {
        label: "Demo only contact",
        country: "GB",
        destination: "+442079460123",
        routing_number_id: number.id,
      })
    ).status,
    201,
  );
  const lookup = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: { target: "Demo only contact" },
    }),
  );
  assert.equal(lookup.next_action, "contact_not_found");
  const national = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: { target: "020 7946 0123" },
    }),
  );
  assert.equal(national.next_action, "country_required");
  const global = structured(
    await client.callTool({
      name: "prepare_call",
      arguments: { target: "+442079460123" },
    }),
  );
  assert.equal(global.next_action, "native_country_unsupported");
  assert.equal(global.ready, false);
  assert.equal(h.providerRequests(), 0);
});
