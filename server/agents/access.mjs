import { deny } from "../accounts/model.mjs";
import {
  digest,
  randomToken,
  onlyFields,
} from "../accounts/auth-primitives.mjs";

export const AGENT_SCOPES = Object.freeze({
  "contacts:read": "Read your contacts and saved context",
  "contacts:write": "Save contacts and contact notes",
  "history:read": "Read call history and available conversation notes",
  "calls:prepare": "Prepare calls and request your approval",
  "calls:read": "Read the status of your calls",
  "outcomes:write": "Save call outcomes and follow-ups",
  "calls:request": "Start a callback only after you approve it in the studio",
});
export const DEFAULT_AGENT_SCOPES = Object.keys(AGENT_SCOPES).filter(
  (scope) => scope !== "calls:request",
);
export const tokenResource = (origin) => new URL("/mcp", origin).href;
const scopes = (value) =>
  typeof value === "string"
    ? value.split(" ").filter(Boolean)
    : Array.isArray(value)
      ? value
      : [];
export function allowedScopes(value, maximum = Object.keys(AGENT_SCOPES)) {
  const list = [...new Set(scopes(value))];
  if (
    !list.length ||
    list.some((scope) => typeof scope !== "string" || !maximum.includes(scope))
  )
    deny(400, "invalid_scope", "Choose supported agent permissions.");
  return list;
}
export const hasScope = (actor, scope) => actor.scopes.includes(scope);
export function requireScope(actor, scope) {
  if (!hasScope(actor, scope))
    deny(
      403,
      "insufficient_scope",
      "This connection needs " + scope + " permission.",
    );
}
export async function getAgentRequest(database, id) {
  const row = await database.first(
    "SELECT r.*,c.metadata FROM ab_agent_requests r JOIN ab_agent_clients c ON c.client_id=r.client_id WHERE r.id=? AND r.expires_at>? AND r.consumed_at IS NULL",
    [id, Date.now()],
  );
  if (!row)
    deny(
      404,
      "REQUEST_EXPIRED",
      "This connection request has expired. Start again from your agent.",
    );
  const payload = JSON.parse(row.payload),
    client = JSON.parse(row.metadata);
  return { row, payload, client };
}
export async function agentRequestView(database, id) {
  const { row, payload, client } = await getAgentRequest(database, id);
  return {
    id: row.id,
    client_name: client.client_name || "MCP client",
    redirect_uri: payload.redirectUri,
    scopes: payload.scopes,
    permissions: payload.scopes.map((scope) => ({
      scope,
      label: AGENT_SCOPES[scope],
    })),
    expires_at: row.expires_at,
  };
}
export async function approveAgentRequest(database, account, input, origin) {
  onlyFields(input, ["request_id", "approved", "scopes"]);
  if (
    typeof input.request_id !== "string" ||
    typeof input.approved !== "boolean"
  )
    deny(422, "INVALID_APPROVAL", "Choose whether to connect this app.");
  const { row, payload } = await getAgentRequest(database, input.request_id);
  const selected = input.approved
    ? allowedScopes(input.scopes || payload.scopes, payload.scopes)
    : [];
  const total = await database.first(
    "SELECT COUNT(*) AS n FROM ab_agent_grants WHERE account_id=? AND revoked_at IS NULL",
    [account.id],
  );
  if (input.approved && total.n >= 50)
    deny(
      409,
      "CONNECTION_LIMIT",
      "Disconnect an unused app before adding another.",
    );
  const claimed = await database.run(
    "UPDATE ab_agent_requests SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?",
    [Date.now(), row.id, Date.now()],
  );
  if (!claimed.changes)
    deny(409, "REQUEST_CONSUMED", "This request was already answered.");
  const redirect = new URL(payload.redirectUri);
  if (payload.state) redirect.searchParams.set("state", payload.state);
  redirect.searchParams.set("iss", new URL(origin).href);
  if (!input.approved) {
    redirect.searchParams.set("error", "access_denied");
    return { redirect: redirect.href };
  }
  const id = crypto.randomUUID(),
    code = randomToken(),
    stamp = Date.now();
  await database.batch([
    {
      sql: "INSERT INTO ab_agent_grants(id,account_id,client_id,scopes,resource,created_at) VALUES(?,?,?,?,?,?)",
      params: [
        id,
        account.id,
        row.client_id,
        selected.join(" "),
        tokenResource(origin),
        stamp,
      ],
    },
    {
      sql: "INSERT INTO ab_agent_codes(code_hash,grant_id,redirect_uri,challenge,expires_at) VALUES(?,?,?,?,?)",
      params: [
        await digest(code),
        id,
        payload.redirectUri,
        payload.codeChallenge,
        stamp + 5 * 60_000,
      ],
    },
  ]);
  redirect.searchParams.set("code", code);
  return { redirect: redirect.href };
}
export async function listAgentGrants(database, accountId) {
  const row = await database.first(
    "SELECT json_group_array(json_object('id',g.id,'client_name',json_extract(c.metadata,'$.client_name'),'scopes',g.scopes,'created_at',g.created_at,'last_used_at',g.last_used_at,'revoked_at',g.revoked_at)) AS items FROM ab_agent_grants g JOIN ab_agent_clients c ON c.client_id=g.client_id WHERE g.account_id=?",
    [accountId],
  );
  return JSON.parse(row?.items || "[]")
    .sort((a, b) => b.created_at - a.created_at)
    .map((item) => ({ ...item, scopes: scopes(item.scopes) }));
}
export async function revokeAgentGrant(database, accountId, id) {
  const row = await database.first(
    "SELECT id FROM ab_agent_grants WHERE id=? AND account_id=?",
    [id, accountId],
  );
  if (!row) deny(404, "CONNECTION_NOT_FOUND", "Agent connection not found.");
  await database.run(
    "UPDATE ab_agent_grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND account_id=?",
    [Date.now(), id, accountId],
  );
  return { revoked: true };
}
export async function issueAgentTokens(database, grant, requested) {
  const granted = allowedScopes(
    requested || grant.scopes,
    scopes(grant.scopes),
  );
  const access = randomToken(),
    refresh = randomToken(),
    now = Date.now();
  await database.batch([
    {
      sql: "INSERT INTO ab_agent_tokens(token_hash,grant_id,kind,scopes,expires_at,created_at) VALUES(?,?,'access',?,?,?)",
      params: [
        await digest(access),
        grant.id,
        granted.join(" "),
        now + 60 * 60_000,
        now,
      ],
    },
    {
      sql: "INSERT INTO ab_agent_tokens(token_hash,grant_id,kind,scopes,expires_at,created_at) VALUES(?,?,'refresh',?,?,?)",
      params: [
        await digest(refresh),
        grant.id,
        granted.join(" "),
        now + 30 * 24 * 60 * 60_000,
        now,
      ],
    },
  ]);
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: 3600,
    scope: granted.join(" "),
  };
}
export async function verifyAgentToken(database, token, origin) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    deny(401, "invalid_token", "Connect your AgentBridge account again.");
  const row = await database.first(
    "SELECT t.*,g.account_id,g.client_id,g.resource,g.revoked_at FROM ab_agent_tokens t JOIN ab_agent_grants g ON g.id=t.grant_id WHERE t.token_hash=? AND t.kind='access' AND t.expires_at>? AND g.revoked_at IS NULL",
    [await digest(token), Date.now()],
  );
  if (!row || row.resource !== tokenResource(origin))
    deny(401, "invalid_token", "This agent connection is expired or revoked.");
  const account = await database.first("SELECT * FROM ab_accounts WHERE id=?", [
    row.account_id,
  ]);
  if (!account) deny(401, "invalid_token", "Account not found.");
  await database.run("UPDATE ab_agent_grants SET last_used_at=? WHERE id=?", [
    Date.now(),
    row.grant_id,
  ]);
  return {
    account,
    scopes: scopes(row.scopes),
    grantId: row.grant_id,
    clientId: row.client_id,
    expiresAt: Math.floor(row.expires_at / 1000),
    resource: row.resource,
  };
}
