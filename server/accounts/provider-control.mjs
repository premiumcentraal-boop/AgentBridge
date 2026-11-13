import { AccountError, deny } from "./model.mjs";
import {
  sealCredential,
  openCredential,
  vaultAvailable,
} from "./credential-vault.mjs";
import {
  signalWireClient,
  signalWireConfig,
  ProviderError,
  UUID,
} from "./signalwire-client.mjs";
import { emptyLiveWorkspace, readLive, stamp } from "./live-store.mjs";
export const onlyFields = (value, allowed) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    deny(422, "INVALID_FIELDS", "The request contains unsupported fields.");
};
export const named = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= 80 &&
  !/[\u0000-\u001f\u007f]/.test(value);
export const requireCharges = (input) => {
  if (input.confirm_charges !== true)
    deny(
      422,
      "CHARGE_CONFIRMATION_REQUIRED",
      "Confirm that SignalWire may charge your own project for this action.",
    );
};
export async function providerSummary(database, accountId, vaultKey) {
  const row = await database.first(
    "SELECT provider,space,project_id,token_hint,live_enabled,verified_at FROM ab_provider_connections WHERE account_id=?",
    [accountId],
  );
  return {
    configured: Boolean(row),
    vault_ready: vaultAvailable(vaultKey),
    provider: "signalwire",
    space: row?.space || null,
    project_id: row?.project_id || null,
    token_hint: row?.token_hint || null,
    live_enabled: Boolean(row?.live_enabled),
    verified_at: row?.verified_at || null,
    capabilities: {
      numbers: true,
      purchasing: true,
      forwarding: true,
      call_control: true,
      recording: true,
      test_callback: true,
      phone_join: false,
      live_transcription: false,
      browser_audio: false,
    },
  };
}
export async function connectedProvider(
  database,
  accountId,
  vaultKey,
  fetcher,
) {
  const row = await database.first(
    "SELECT * FROM ab_provider_connections WHERE account_id=?",
    [accountId],
  );
  if (!row)
    deny(
      409,
      "PROVIDER_REQUIRED",
      "Add your SignalWire project in Settings first.",
    );
  const secret = await openCredential(
    row.encrypted_secret,
    vaultKey,
    accountId,
  );
  return {
    row,
    client: signalWireClient(
      {
        space: row.space,
        project_id: row.project_id,
        api_token: secret.api_token,
      },
      fetcher,
    ),
  };
}
export async function providerLease(database, accountId, run) {
  const id = crypto.randomUUID();
  const claimed = await database.run(
    "INSERT INTO ab_provider_locks(account_id,operation_id,expires_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET operation_id=excluded.operation_id,expires_at=excluded.expires_at WHERE ab_provider_locks.expires_at<?",
    [accountId, id, Date.now() + 120_000, Date.now()],
  );
  if (!claimed.changes)
    deny(
      409,
      "PROVIDER_BUSY",
      "Another provider action is still running. Refresh before trying again.",
    );
  try {
    return await run();
  } finally {
    await database.run(
      "DELETE FROM ab_provider_locks WHERE account_id=? AND operation_id=?",
      [accountId, id],
    );
  }
}
export async function providerOperation(
  database,
  accountId,
  { request_id, kind, target, input, provider },
  run,
) {
  if (!UUID.test(request_id || ""))
    deny(422, "INVALID_REQUEST_ID", "A request identifier is required.");
  const fingerprint = JSON.stringify({ kind, target, input });
  return providerLease(database, accountId, async () => {
    const previous = await database.first(
      "SELECT * FROM ab_provider_operations WHERE account_id=? AND request_key=?",
      [accountId, request_id],
    );
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        deny(
          409,
          "REQUEST_CONFLICT",
          "This request identifier was already used for another action.",
        );
      if (previous.status === "succeeded") return JSON.parse(previous.result);
      deny(
        409,
        "PROVIDER_RECONCILIATION_REQUIRED",
        previous.status === "failed"
          ? "The earlier action failed. Refresh before starting a new request."
          : "The earlier result is uncertain. Check SignalWire before retrying; it has not been sent again.",
      );
    }
    const uncertain = await database.first(
      "SELECT id FROM ab_provider_operations WHERE account_id=? AND kind=? AND target=? AND status IN ('pending','unknown')",
      [accountId, kind, target],
    );
    if (uncertain)
      deny(
        409,
        "PROVIDER_RECONCILIATION_REQUIRED",
        "A previous action on this item has an uncertain result. Refresh or check SignalWire first.",
      );
    const id = crypto.randomUUID(),
      time = stamp();
    const before = provider?.mutations();
    await database.run(
      "INSERT INTO ab_provider_operations(id,account_id,request_key,kind,target,fingerprint,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)",
      [id, accountId, request_id, kind, target, fingerprint, time, time],
    );
    try {
      const result = await run();
      await database.run(
        "UPDATE ab_provider_operations SET status='succeeded',result=?,updated_at=? WHERE id=?",
        [JSON.stringify(result), stamp(), id],
      );
      return result;
    } catch (error) {
      const after = provider?.mutations();
      const mutated = before && after && after.attempted > before.attempted;
      const failed =
        !mutated ||
        (error instanceof ProviderError &&
          error.rejectedWrite &&
          after.confirmed === before.confirmed);
      try {
        await database.run(
          "UPDATE ab_provider_operations SET status=?,updated_at=? WHERE id=?",
          [failed ? "failed" : "unknown", stamp(), id],
        );
      } catch {}
      if (!failed && !(error instanceof ProviderError && error.ambiguous))
        throw new AccountError(
          502,
          "PROVIDER_RESULT_UNCERTAIN",
          "SignalWire may have completed the action, but the result could not be saved or verified. Refresh and review the provider state before retrying.",
        );
      throw error;
    }
  });
}
export function publicProviderError(error) {
  if (!(error instanceof ProviderError)) return error;
  const auth = error.status === 401 || error.status === 403;
  return new AccountError(
    auth ? 403 : 502,
    auth
      ? "PROVIDER_PERMISSION_DENIED"
      : error.ambiguous
        ? "PROVIDER_RESULT_UNCERTAIN"
        : "PROVIDER_REQUEST_FAILED",
    auth
      ? "SignalWire rejected this token. Check its Numbers and Voice permissions."
      : error.ambiguous
        ? "SignalWire did not confirm the result. Refresh or check your project before retrying; this action will not be sent again automatically."
        : "SignalWire could not complete this request. Check availability, project balance and destination permissions, then refresh.",
  );
}
export async function manageProvider({
  database,
  account,
  path,
  method,
  readBody,
  vaultKey,
  fetcher,
}) {
  if (path === "provider/status" && method === "GET")
    return {
      status: 200,
      body: await providerSummary(database, account.id, vaultKey),
    };
  if (path === "provider/credentials" && method === "POST") {
    if (!vaultAvailable(vaultKey))
      deny(
        503,
        "VAULT_UNAVAILABLE",
        "Secure provider storage is not configured on this server.",
      );
    const input = await readBody();
    onlyFields(input, ["space", "project_id", "api_token"]);
    const config = signalWireConfig(input);
    return providerLease(database, account.id, async () => {
      const old = await database.first(
        "SELECT space,project_id,live_enabled FROM ab_provider_connections WHERE account_id=?",
        [account.id],
      );
      if (
        old &&
        (old.space !== config.space || old.project_id !== config.project_id)
      )
        deny(
          409,
          "PROJECT_CHANGE_REQUIRES_DISCONNECT",
          "Disconnect the current project before switching to another project.",
        );
      const client = signalWireClient(config, fetcher);
      await client.listNumbers();
      const calls = await client.compat("/Calls?PageSize=1");
      if (!Array.isArray(calls.calls)) throw new ProviderError(502);
      const encrypted = await sealCredential(
        { api_token: config.api_token },
        vaultKey,
        account.id,
      );
      const now = stamp();
      await database.batch([
        {
          sql: "INSERT INTO ab_provider_connections(account_id,provider,space,project_id,encrypted_secret,token_hint,live_enabled,verified_at,updated_at) VALUES(?,'signalwire',?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,token_hint=excluded.token_hint,verified_at=excluded.verified_at,updated_at=excluded.updated_at",
          params: [
            account.id,
            config.space,
            config.project_id,
            encrypted,
            "••••" + config.api_token.slice(-4),
            old?.live_enabled || 0,
            now,
            now,
          ],
        },
        {
          sql: "INSERT INTO ab_live_workspaces(account_id,document,updated_at) VALUES(?,?,?) ON CONFLICT(account_id) DO NOTHING",
          params: [account.id, JSON.stringify(emptyLiveWorkspace()), now],
        },
      ]);
      return {
        status: 200,
        body: await providerSummary(database, account.id, vaultKey),
      };
    });
  }
  if (path === "provider/mode" && method === "PATCH") {
    const input = await readBody();
    onlyFields(input, ["live_enabled"]);
    if (typeof input.live_enabled !== "boolean")
      deny(422, "INVALID_MODE", "Choose demo or live testing.");
    return providerLease(database, account.id, async () => {
      const { client } = await connectedProvider(
        database,
        account.id,
        vaultKey,
        fetcher,
      );
      if (input.live_enabled) await client.listNumbers();
      else {
        const active = await database.first(
          "SELECT connection_id FROM ab_live_routes WHERE account_id=? AND status!='inactive' LIMIT 1",
          [account.id],
        );
        if (
          active ||
          (await readLive(database, account.id)).calls.some((c) =>
            ["queued", "ringing", "in-progress"].includes(c.status),
          )
        )
          deny(
            409,
            "STOP_LIVE_ACTIVITY_FIRST",
            "End calls and deactivate forwarding before returning to demo mode.",
          );
      }
      await database.run(
        "UPDATE ab_provider_connections SET live_enabled=?,updated_at=? WHERE account_id=?",
        [input.live_enabled ? 1 : 0, stamp(), account.id],
      );
      return {
        status: 200,
        body: await providerSummary(database, account.id, vaultKey),
      };
    });
  }
  if (path === "provider/credentials" && method === "DELETE") {
    onlyFields(await readBody(), []);
    return providerLease(database, account.id, async () => {
      const active = await database.first(
        "SELECT connection_id FROM ab_live_routes WHERE account_id=? AND status!='inactive' LIMIT 1",
        [account.id],
      );
      if (active)
        deny(
          409,
          "ACTIVE_FORWARDING",
          "Deactivate or reconcile your forwarding connections before removing the key.",
        );
      if (
        (await readLive(database, account.id)).calls.some((c) =>
          ["queued", "ringing", "in-progress"].includes(c.status),
        )
      )
        deny(
          409,
          "ACTIVE_CALL",
          "End your active calls and refresh before removing the key.",
        );
      const pending = await database.first(
        "SELECT id FROM ab_provider_operations WHERE account_id=? AND status IN ('pending','unknown') LIMIT 1",
        [account.id],
      );
      if (pending)
        deny(
          409,
          "PROVIDER_RECONCILIATION_REQUIRED",
          "Resolve uncertain provider actions before removing the key.",
        );
      await database.batch([
        {
          sql: "DELETE FROM ab_provider_connections WHERE account_id=?",
          params: [account.id],
        },
        {
          sql: "DELETE FROM ab_live_workspaces WHERE account_id=?",
          params: [account.id],
        },
        {
          sql: "DELETE FROM ab_live_routes WHERE account_id=?",
          params: [account.id],
        },
        {
          sql: "DELETE FROM ab_provider_operations WHERE account_id=?",
          params: [account.id],
        },
      ]);
      return {
        status: 200,
        body: {
          configured: false,
          live_enabled: false,
          vault_ready: vaultAvailable(vaultKey),
        },
      };
    });
  }
  return null;
}
