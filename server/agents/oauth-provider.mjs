import {
  InvalidClientMetadataError,
  InvalidRequestError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import {
  allowedScopes,
  DEFAULT_AGENT_SCOPES,
  tokenResource,
  issueAgentTokens,
  verifyAgentToken,
} from "./access.mjs";
import { digest } from "../accounts/auth-primitives.mjs";
import {
  sealCredential,
  openCredential,
  vaultAvailable,
} from "../accounts/credential-vault.mjs";

const invalidGrant = () => {
  throw new InvalidGrantError(
    "The authorization is expired, consumed or revoked.",
  );
};
export function createAgentOAuthProvider({ database, origin, vaultKey }) {
  const resource = tokenResource(origin);
  const target = (value) => {
    if (value && value.href !== resource)
      throw new InvalidTargetError(
        "The token resource must be the AgentBridge MCP endpoint.",
      );
  };
  const scopeList = (value, maximum) => {
    try {
      return allowedScopes(value, maximum);
    } catch {
      throw new InvalidScopeError("Unsupported agent permissions.");
    }
  };
  const activeGrant = async (id, client) => {
    const row = await database.first(
      "SELECT * FROM ab_agent_grants WHERE id=? AND client_id=? AND revoked_at IS NULL",
      [id, client.client_id],
    );
    if (!row || row.resource !== resource) invalidGrant();
    return row;
  };
  const clientsStore = {
    async getClient(id) {
      if (typeof id !== "string" || id.length > 100) return undefined;
      const row = await database.first(
        "SELECT metadata FROM ab_agent_clients WHERE client_id=?",
        [id],
      );
      if (!row) return undefined;
      const { encrypted_client_secret, ...metadata } = JSON.parse(row.metadata);
      if (encrypted_client_secret) {
        const secret = await openCredential(
          encrypted_client_secret,
          vaultKey,
          id,
          "oauth-client",
        );
        metadata.client_secret = secret.client_secret;
      }
      return metadata;
    },
    async registerClient(client) {
      const method = client.token_endpoint_auth_method || "client_secret_post";
      if (!["none", "client_secret_post"].includes(method))
        throw new InvalidClientMetadataError(
          "Use S256 PKCE with token_endpoint_auth_method=none or client_secret_post.",
        );
      if (method !== "none" && !vaultAvailable(vaultKey))
        throw new InvalidClientMetadataError(
          "Confidential clients need secure server storage. Use a public PKCE client or configure the server vault.",
        );
      if (
        !Array.isArray(client.redirect_uris) ||
        !client.redirect_uris.length ||
        client.redirect_uris.length > 5
      )
        throw new InvalidClientMetadataError(
          "Register one to five exact redirect URLs.",
        );
      for (const uri of client.redirect_uris) {
        try {
          const u = new URL(uri);
          if (
            u.username ||
            u.password ||
            u.hash ||
            uri.length > 2048 ||
            (u.protocol !== "https:" &&
              !(
                u.protocol === "http:" &&
                ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
              ))
          )
            throw new Error();
        } catch {
          throw new InvalidClientMetadataError(
            "Redirects must use HTTPS or a loopback address without credentials or fragments.",
          );
        }
      }
      if (
        client.client_name &&
        (!client.client_name.trim() ||
          client.client_name.length > 100 ||
          /[\u0000-\u001f\u007f]/.test(client.client_name))
      )
        throw new InvalidClientMetadataError("Choose a short client name.");
      const count = await database.first(
        "SELECT COUNT(*) AS n FROM ab_agent_clients",
      );
      if (count.n >= 5000)
        throw new InvalidClientMetadataError(
          "Client registration capacity reached.",
        );
      const info = {
        client_id: crypto.randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.client_name || "MCP client",
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      };
      const stored = { ...info };
      if (method !== "none") {
        info.client_secret = client.client_secret;
        info.client_secret_expires_at = client.client_secret_expires_at;
        stored.client_secret_expires_at = info.client_secret_expires_at;
        stored.encrypted_client_secret = await sealCredential(
          { client_secret: info.client_secret },
          vaultKey,
          info.client_id,
          "oauth-client",
        );
      }
      await database.run(
        "INSERT INTO ab_agent_clients(client_id,metadata,created_at) VALUES(?,?,?)",
        [info.client_id, JSON.stringify(stored), Date.now()],
      );
      return info;
    },
  };
  return {
    clientsStore,
    async authorize(client, params, res) {
      target(params.resource);
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) ||
        (params.state && params.state.length > 1024)
      )
        throw new InvalidRequestError(
          "Use S256 PKCE with a bounded state value.",
        );
      const selected = scopeList(
        params.scopes?.length ? params.scopes : DEFAULT_AGENT_SCOPES,
      );
      const id = crypto.randomUUID();
      await database.run("DELETE FROM ab_agent_requests WHERE expires_at<?", [
        Date.now() - 24 * 60 * 60_000,
      ]);
      await database.run(
        "INSERT INTO ab_agent_requests(id,client_id,payload,expires_at) VALUES(?,?,?,?)",
        [
          id,
          client.client_id,
          JSON.stringify({ ...params, resource, scopes: selected }),
          Date.now() + 10 * 60_000,
        ],
      );
      res.redirect(new URL("/studio/agents/?authorize=" + id, origin).href);
    },
    async challengeForAuthorizationCode(client, code) {
      if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code))
        invalidGrant();
      const row = await database.first(
        "SELECT c.*,g.client_id,g.revoked_at FROM ab_agent_codes c JOIN ab_agent_grants g ON g.id=c.grant_id WHERE c.code_hash=?",
        [await digest(code)],
      );
      if (
        !row ||
        row.client_id !== client.client_id ||
        row.expires_at <= Date.now() ||
        row.used_at ||
        row.revoked_at
      )
        invalidGrant();
      return row.challenge;
    },
    async exchangeAuthorizationCode(
      client,
      code,
      verifier,
      redirectUri,
      requestedResource,
    ) {
      target(requestedResource);
      const hash = await digest(code),
        row = await database.first(
          "SELECT * FROM ab_agent_codes WHERE code_hash=?",
          [hash],
        );
      if (
        !row ||
        row.redirect_uri !== redirectUri ||
        row.expires_at <= Date.now() ||
        row.used_at
      )
        invalidGrant();
      const grant = await activeGrant(row.grant_id, client);
      const claimed = await database.run(
        "UPDATE ab_agent_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?",
        [Date.now(), hash, Date.now()],
      );
      if (!claimed.changes) invalidGrant();
      return issueAgentTokens(database, grant);
    },
    async exchangeRefreshToken(
      client,
      token,
      requestedScopes,
      requestedResource,
    ) {
      target(requestedResource);
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
        invalidGrant();
      const hash = await digest(token),
        row = await database.first(
          "SELECT * FROM ab_agent_tokens WHERE token_hash=? AND kind='refresh'",
          [hash],
        );
      if (!row || row.expires_at <= Date.now()) invalidGrant();
      const grant = await activeGrant(row.grant_id, client);
      if (row.used_at) {
        await database.run(
          "UPDATE ab_agent_grants SET revoked_at=? WHERE id=?",
          [Date.now(), grant.id],
        );
        invalidGrant();
      }
      const selected = scopeList(
        requestedScopes?.length ? requestedScopes : row.scopes,
        row.scopes.split(" "),
      );
      const claimed = await database.run(
        "UPDATE ab_agent_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL",
        [Date.now(), hash],
      );
      if (!claimed.changes) {
        await database.run(
          "UPDATE ab_agent_grants SET revoked_at=? WHERE id=?",
          [Date.now(), grant.id],
        );
        invalidGrant();
      }
      return issueAgentTokens(database, grant, selected);
    },
    async verifyAccessToken(token) {
      try {
        const actor = await verifyAgentToken(database, token, origin);
        return {
          token,
          clientId: actor.clientId,
          scopes: actor.scopes,
          expiresAt: actor.expiresAt,
          resource: new URL(actor.resource),
          extra: { account_id: actor.account.id, grant_id: actor.grantId },
        };
      } catch {
        throw new InvalidTokenError("Reconnect your AgentBridge account.");
      }
    },
    async revokeToken(client, input) {
      if (typeof input.token !== "string" || input.token.length > 256) return;
      const row = await database.first(
        "SELECT t.grant_id,g.client_id FROM ab_agent_tokens t JOIN ab_agent_grants g ON g.id=t.grant_id WHERE t.token_hash=?",
        [await digest(input.token)],
      );
      if (row?.client_id === client.client_id)
        await database.run(
          "UPDATE ab_agent_grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=?",
          [Date.now(), row.grant_id],
        );
    },
  };
}
