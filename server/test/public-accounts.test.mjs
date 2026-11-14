import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.mjs";
import { openStore } from "../store.mjs";
import { openAccountDatabase } from "../accounts/node-database.mjs";
import { createAuthEmail } from "../accounts/email.mjs";
import { nodePasswords } from "../accounts/passwords.mjs";
import { signalWireFixture } from "./helpers/signalwire-fixture.mjs";

const origin = "https://agentbridge.victor.ceo";
const password = "a long password for email account tests";
const key = "re_" + "test".repeat(10);
const sender = "AgentBridge <accounts@mail.agentbridge.victor.ceo>";
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function harness(
  t,
  overrides = {},
  { filename = ":memory:", fetcher, carrierFetcher } = {},
) {
  const database = openAccountDatabase(filename),
    outbox = [];
  const env = {
    NODE_ENV: "production",
    STUDIO_SIGNUP_MODE: "public",
    STUDIO_PUBLIC_ORIGIN: origin,
    RESEND_API_KEY: key,
    AUTH_EMAIL_FROM: sender,
    ...overrides,
  };
  const server = createApp({
    env,
    store: openStore(":memory:"),
    accountDatabase: database,
    fetcher:
      fetcher ||
      (async (url, options) => {
        if (url !== "https://api.resend.com/emails" && carrierFetcher)
          return carrierFetcher(url, options);
        assert.equal(url, "https://api.resend.com/emails");
        assert.equal(options.headers.Authorization, "Bearer " + key);
        assert.equal(options.redirect, "error");
        assert.match(
          options.headers["Idempotency-Key"],
          /^agentbridge-auth\/[a-f0-9-]{36}$/,
        );
        outbox.push(JSON.parse(options.body));
        return new Response('{"id":"fixture-mail"}', { status: 200 });
      }),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (path, options = {}) =>
    fetch("http://127.0.0.1:" + server.address().port + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...options.headers,
      },
    });
  const post = (route, input, headers) =>
    request("/api/auth/" + route, {
      method: "POST",
      body: JSON.stringify(input),
      headers,
    });
  const link = (email, purpose = "verify-email") => {
    const message = outbox.findLast(
      (message) =>
        message.to[0] === email && message.text.includes("/" + purpose + "/"),
    );
    assert.ok(message, "Expected a transactional email");
    return new URL(
      message.text.match(/https:\/\/[^\s]+#token=[a-f0-9]{64}/)[0],
    );
  };
  const register = async (email, details = {}) => {
    const result = await post("register", {
      email,
      name: "Test user",
      agent_name: "Concierge",
      ...details,
    });
    assert.equal(result.status, 202, await result.clone().text());
    assert.equal(result.headers.get("set-cookie"), null);
    return new URLSearchParams(link(email).hash.slice(1)).get("token");
  };
  const signup = async (email) => {
    const token = await register(email),
      response = await post("verify-email", { token, password });
    assert.equal(response.status, 201, await response.clone().text());
    return {
      account: (await response.json()).account,
      cookie: response.headers.get("set-cookie").split(";")[0],
      token,
    };
  };
  return { database, request, post, outbox, link, register, signup };
}

test("public signup requires email ownership, creates independent accounts and never returns email tokens", async (t) => {
  const h = await harness(t, { DEMO_TESTER_EMAIL: "old-tester@example.com" });
  const session = await (await h.request("/api/auth/session")).json();
  assert.equal(session.signup_mode, "public");
  assert.equal(session.registration_available, true);
  assert.equal(session.invitation_required, false);
  assert.equal(session.password_reset_available, true);
  assert.equal(session.account_exists, undefined);
  const token = await h.register("first@example.com");
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    0,
  );
  const pending = await h.database.first("SELECT * FROM ab_email_tokens");
  assert.notEqual(pending.token_hash, token);
  assert.equal(pending.token_hash, hash(token));
  assert.doesNotMatch(JSON.stringify(pending), new RegExp(password));
  const waiting = await h.post("login", {
    email: "first@example.com",
    password,
  });
  assert.equal(waiting.status, 401);
  const verified = await h.post("verify-email", { token, password });
  assert.equal(verified.status, 201, await verified.clone().text());
  const first = await verified.json(),
    cookie = verified.headers.get("set-cookie").split(";")[0];
  assert.equal(first.account.email, "first@example.com");
  assert.equal(first.account.password_hash, undefined);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api"])
    assert.ok(verified.headers.get("set-cookie").includes(flag));
  const replay = await h.post("verify-email", { token, password });
  assert.equal(replay.status, 400);
  const second = await h.signup("second@example.com");
  assert.notEqual(first.account.id, second.account.id);
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    2,
  );
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_workspaces")).n,
    2,
  );
  await h.request("/api/studio/settings", {
    method: "PATCH",
    headers: { Cookie: cookie },
    body: JSON.stringify({ experience: "advanced" }),
  });
  const read = async (cookie) =>
    (
      await h.request("/api/studio/overview", { headers: { Cookie: cookie } })
    ).json();
  assert.equal((await read(cookie)).settings.experience, "advanced");
  const other = await read(second.cookie);
  assert.equal(other.settings.experience, "simple");
  assert.equal(other.account.email, "second@example.com");
  assert.deepEqual(other.routing_numbers, []);
  const before = h.outbox.length;
  const existing = await h.post("register", {
    email: "first@example.com",
    name: "Overwrite",
    agent_name: "Changed",
  });
  assert.equal(existing.status, 202);
  assert.equal(h.outbox.length, before);
  assert.equal(
    (
      await h.database.first("SELECT name FROM ab_accounts WHERE id=?", [
        first.account.id,
      ])
    ).name,
    "Test user",
  );
  const health = await (await h.request("/health")).json();
  assert.equal(health.mode, "public-accounts");
  assert.equal(health.email_configured, true);
});

test("a verification token cannot create two accounts or two sessions in concurrent requests", async (t) => {
  const h = await harness(t),
    token = await h.register("race@example.com");
  const responses = await Promise.all([
    h.post("verify-email", { token, password }),
    h.post("verify-email", { token, password }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 400],
  );
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    1,
  );
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_sessions")).n,
    1,
  );
});

test("two public users cannot read or mutate each other's SignalWire credentials or live connections", async (t) => {
  const a = signalWireFixture(),
    b = signalWireFixture();
  const h = await harness(
    t,
    { PROVIDER_CREDENTIALS_KEY: randomBytes(32).toString("hex") },
    {
      carrierFetcher: (url, options) =>
        (options.headers.Authorization ===
        "Basic " + btoa(a.config().project_id + ":" + a.config().api_token)
          ? a
          : b
        ).fetcher(url, options),
    },
  );
  const first = await h.signup("carrier-first@example.com"),
    second = await h.signup("carrier-second@example.com");
  const studio = (cookie, path, method = "GET", body) =>
    h.request("/api/studio/" + path, {
      method,
      headers: { Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const saved = await studio(
    first.cookie,
    "provider/credentials",
    "POST",
    a.config(),
  );
  assert.equal(saved.status, 200, await saved.clone().text());
  const foreign = await (
    await studio(
      second.cookie,
      "provider/status?account_id=" + first.account.id,
    )
  ).json();
  assert.equal(foreign.configured, false);
  assert.equal(foreign.project_id, null);
  assert.equal(
    (await studio(second.cookie, "provider/credentials", "GET")).status,
    404,
  );
  assert.equal(
    (
      await studio(second.cookie, "provider/mode", "PATCH", {
        live_enabled: true,
        account_id: first.account.id,
      })
    ).status,
    422,
  );
  assert.equal(
    (await studio(second.cookie, "provider/credentials", "POST", b.config()))
      .status,
    200,
  );
  for (const cookie of [first.cookie, second.cookie])
    assert.equal(
      (await studio(cookie, "provider/mode", "PATCH", { live_enabled: true }))
        .status,
      200,
    );
  const imported = await studio(first.cookie, "live/numbers/import", "POST", {
    provider_number_id: a.owned.id,
    label: "Private number",
  });
  assert.equal(imported.status, 201, await imported.clone().text());
  const { number } = await imported.json();
  const connectionResult = await studio(
    first.cookie,
    "live/connections",
    "POST",
    {
      label: "Private destination",
      routing_number_id: number.id,
      destination: "+442079460123",
      country: "GB",
    },
  );
  assert.equal(
    connectionResult.status,
    201,
    await connectionResult.clone().text(),
  );
  const { connection } = await connectionResult.json();
  const before = b.state.requests.length;
  assert.equal(
    (
      await studio(
        second.cookie,
        "live/connections/" + connection.id,
        "DELETE",
        {},
      )
    ).status,
    404,
  );
  assert.equal(
    b.state.requests.length,
    before,
    "Foreign record IDs cause no carrier mutation",
  );
  const overview = await (await studio(second.cookie, "live/overview")).json();
  assert.doesNotMatch(
    JSON.stringify(overview),
    /Private number|Private destination|\+442079460123/,
  );
  assert.equal(
    (await (await studio(first.cookie, "provider/status")).json()).project_id,
    a.config().project_id,
  );
  const stored = await h.database.first(
    "SELECT encrypted_secret FROM ab_provider_connections WHERE account_id=?",
    [first.account.id],
  );
  assert.ok(stored.encrypted_secret.startsWith("v1:"));
  assert.ok(!stored.encrypted_secret.includes(a.config().api_token));
});

test("recovery closes every prior session, revokes outstanding links, preserves data and uses the new password", async (t) => {
  const h = await harness(t),
    first = await h.signup("reset@example.com");
  const login = await h.post("login", { email: "reset@example.com", password });
  assert.equal(login.status, 200);
  const otherCookie = login.headers.get("set-cookie").split(";")[0];
  await h.request("/api/studio/settings", {
    method: "PATCH",
    headers: { Cookie: first.cookie },
    body: JSON.stringify({ experience: "guided" }),
  });
  const result = await h.post("forgot-password", {
    email: "reset@example.com",
  });
  assert.equal(result.status, 202);
  const token = new URLSearchParams(
    h.link("reset@example.com", "reset-password").hash.slice(1),
  ).get("token");
  assert.equal(
    (await h.post("verify-email", { token, password })).status,
    400,
    "Wrong purpose is rejected",
  );
  const next = password + " changed";
  const changed = await h.post("reset-password", { token, password: next });
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.equal(changed.headers.get("set-cookie"), null);
  for (const cookie of [first.cookie, otherCookie])
    assert.equal(
      (await h.request("/api/studio/overview", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  assert.equal(
    (await h.post("reset-password", { token, password: next })).status,
    400,
  );
  assert.equal(
    (await h.post("login", { email: "reset@example.com", password })).status,
    401,
  );
  const fresh = await h.post("login", {
    email: "reset@example.com",
    password: next,
  });
  assert.equal(fresh.status, 200);
  const snapshot = await (
    await h.request("/api/studio/overview", {
      headers: { Cookie: fresh.headers.get("set-cookie").split(";")[0] },
    })
  ).json();
  assert.equal(snapshot.settings.experience, "guided");
  const unknown = await h.post("forgot-password", {
    email: "unknown@example.com",
  });
  assert.equal(unknown.status, 202);
  assert.deepEqual(await unknown.json(), await result.json());
  assert.equal(
    h.outbox.filter((message) => message.to[0] === "unknown@example.com")
      .length,
    0,
  );
});

test("expired links, forgery, cross-site requests and delivery failures never grant access", async (t) => {
  const h = await harness(t),
    token = await h.register("expired@example.com");
  await h.database.run("UPDATE ab_email_tokens SET expires_at=0");
  assert.equal((await h.post("verify-email", { token, password })).status, 400);
  assert.equal(
    (await h.post("verify-email", { token: "0".repeat(64), password })).status,
    400,
  );
  assert.equal(
    (
      await h.post("verify-email", {
        token,
        password,
        email_verified_at: "forged",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await h.post(
        "register",
        { email: "cross@example.com", name: "User", agent_name: "Agent" },
        { Origin: "https://attacker.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request("/api/studio/overview", {
        headers: {
          "oai-authenticated-user-id": "fake",
          "oai-authenticated-user-email": "expired@example.com",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (await h.database.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    0,
  );
  const broken = await harness(
    t,
    {},
    {
      fetcher: async () =>
        new Response("secret carrier-style failure detail", { status: 401 }),
    },
  );
  const fail = await broken.post("register", {
    email: "mail@example.com",
    name: "User",
    agent_name: "Agent",
  });
  assert.equal(fail.status, 503);
  assert.doesNotMatch(await fail.text(), /secret carrier-style/);
  assert.equal(
    (await broken.database.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    0,
  );
  const unavailable = await harness(t, { RESEND_API_KEY: "" });
  assert.equal(
    (await (await unavailable.request("/api/auth/session")).json())
      .registration_available,
    false,
  );
  assert.equal(
    (
      await unavailable.post("register", {
        email: "mail@example.com",
        name: "User",
        agent_name: "Agent",
      })
    ).status,
    503,
  );
});

test("email throttles persist and proxy headers are ignored without explicit Railway deployment trust", async (t) => {
  const h = await harness(t);
  for (let index = 0; index < 3; index++)
    assert.equal(
      (
        await h.post(
          "register",
          { email: "limited@example.com", name: "User", agent_name: "Agent" },
          {
            "X-Forwarded-For": "192.0.2." + index,
            "X-Real-IP": "192.0.2." + index,
          },
        )
      ).status,
      202,
    );
  assert.equal(
    (
      await h.post("register", {
        email: "limited@example.com",
        name: "User",
        agent_name: "Agent",
      })
    ).status,
    429,
  );
  assert.equal(h.outbox.length, 3);
  for (let index = 0; index < 6; index++)
    assert.equal(
      (
        await h.post(
          "forgot-password",
          { email: `missing${index}@example.com` },
          { "X-Real-IP": "192.0.2." + index },
        )
      ).status,
      202,
    );
  assert.equal(
    (
      await h.post(
        "forgot-password",
        { email: "another@example.com" },
        { "X-Real-IP": "198.51.100.1" },
      )
    ).status,
    429,
  );
});

test("Resend auth emails use a fixed origin and keep bearer links out of URL queries", async () => {
  const sent = [];
  const email = createAuthEmail({
    apiKey: key,
    from: sender,
    publicOrigin: origin,
    fetcher: async (url, options) => {
      sent.push({ url, options, body: JSON.parse(options.body) });
      return new Response("{}");
    },
  });
  assert.equal(email.ready, true);
  await email.send({
    purpose: "verify",
    email: "person@example.com",
    token: "a".repeat(64),
    requestId: "12345678-1234-4234-8234-123456789012",
  });
  assert.match(sent[0].body.html, /Verify email &amp; choose password/);
  assert.match(
    sent[0].body.text,
    /https:\/\/agentbridge\.victor\.ceo\/verify-email\/#token=/,
  );
  assert.doesNotMatch(
    sent[0].body.html,
    /\?token=|<script|<img|person@example/,
  );
  for (const badOrigin of [
    "http://agentbridge.victor.ceo",
    origin + "/redirect/",
    origin + "?next=https://evil.example",
    "https://user:pass@agentbridge.victor.ceo",
  ])
    assert.equal(
      createAuthEmail({ apiKey: key, from: sender, publicOrigin: badOrigin })
        .ready,
      false,
    );
  assert.equal(
    createAuthEmail({
      apiKey: key,
      from: sender + "\r\nBcc:other@example.com",
      publicOrigin: origin,
    }).ready,
    false,
  );
});

test("the public-account migration preserves every legacy child record and requires email proof before reusing a legacy account", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "agentbridge-public-upgrade-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "accounts.sqlite"),
    legacy = new DatabaseSync(filename);
  const stamp = new Date().toISOString(),
    account = "legacy-account";
  legacy.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE ab_schema_migrations(tag TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const file of ["0000_demo_accounts.sql", "0001_provider_testing.sql"]) {
    legacy.exec(
      readFileSync(
        new URL("../accounts/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
    legacy
      .prepare("INSERT INTO ab_schema_migrations VALUES(?,?)")
      .run(file, stamp);
  }
  legacy
    .prepare(
      "INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      account,
      "legacy@example.com",
      "Original",
      "Original agent",
      "password",
      await nodePasswords.hash(password),
      stamp,
      stamp,
    );
  legacy
    .prepare("INSERT INTO ab_sessions VALUES(?,?,?,?)")
    .run(hash("b".repeat(64)), account, Date.now() + 3600_000, stamp);
  legacy
    .prepare("INSERT INTO ab_workspaces VALUES(?,?,?,?)")
    .run(account, 7, '{"settings":{"experience":"advanced"}}', stamp);
  legacy
    .prepare("INSERT INTO ab_live_workspaces VALUES(?,?,?,?)")
    .run(account, 9, '{"connections":[]}', stamp);
  legacy
    .prepare("INSERT INTO ab_provider_connections VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      account,
      "signalwire",
      "fixture",
      "project",
      "encrypted-secret-preserved",
      "hint",
      1,
      stamp,
      stamp,
    );
  legacy
    .prepare("INSERT INTO ab_provider_operations VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(
      "operation",
      account,
      "request",
      "buy",
      "+12025550100",
      "fingerprint",
      "unknown",
      null,
      stamp,
      stamp,
    );
  legacy
    .prepare("INSERT INTO ab_provider_locks VALUES(?,?,?)")
    .run(account, "operation", Date.now() + 60_000);
  legacy
    .prepare("INSERT INTO ab_live_routes VALUES(?,?,?,?,?,?,?,?)")
    .run(
      account,
      "connection",
      "number",
      "script",
      "https://fixture.signalwire.com/script",
      "encrypted-route-preserved",
      "active",
      stamp,
    );
  const tables = [
    "ab_accounts",
    "ab_sessions",
    "ab_workspaces",
    "ab_live_workspaces",
    "ab_provider_connections",
    "ab_provider_operations",
    "ab_provider_locks",
    "ab_live_routes",
  ];
  const before = Object.fromEntries(
    tables.map((table) => [
      table,
      legacy
        .prepare("SELECT * FROM " + table)
        .all()
        .map((row) => ({ ...row })),
    ]),
  );
  legacy.close();
  const h = await harness(t, {}, { filename });
  for (const table of tables) {
    const row = await h.database.first("SELECT * FROM " + table),
      expected = before[table][0];
    if (table === "ab_accounts") {
      delete expected.singleton;
      expected.email_verified_at = null;
    }
    assert.deepEqual({ ...row }, expected, table + " preserved");
  }
  assert.equal(await h.database.first("PRAGMA foreign_key_check"), null);
  assert.equal(
    await h.database.first(
      "SELECT name FROM sqlite_master WHERE name LIKE '_signup_backup_%'",
    ),
    null,
  );
  assert.equal(
    (
      await h.request("/api/studio/overview", {
        headers: { Cookie: "ab_customer=" + "b".repeat(64) },
      })
    ).status,
    401,
  );
  const unverified = await h.post("login", {
    email: "legacy@example.com",
    password,
  });
  assert.equal(unverified.status, 403);
  const token = await h.register("legacy@example.com", {
    name: "Cannot overwrite",
    agent_name: "Other",
  });
  const verified = await h.post("verify-email", {
    token,
    password: password + " verified",
  });
  assert.equal(verified.status, 201, await verified.clone().text());
  const restored = (await verified.json()).account;
  assert.equal(restored.id, account);
  assert.equal(restored.name, "Original");
  assert.equal(
    (
      await h.database.first(
        "SELECT revision FROM ab_workspaces WHERE account_id=?",
        [account],
      )
    ).revision,
    7,
  );
  assert.equal(
    (
      await h.database.first(
        "SELECT encrypted_secret FROM ab_provider_connections WHERE account_id=?",
        [account],
      )
    ).encrypted_secret,
    "encrypted-secret-preserved",
  );
});
