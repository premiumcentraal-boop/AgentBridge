import {
  AGENT_SCOPES,
  DEFAULT_AGENT_SCOPES,
  approveAgentRequest,
  agentRequestView,
  listAgentGrants,
  revokeAgentGrant,
} from "./access.mjs";
import { realContactState, saveRealContact } from "./contacts.mjs";
import { ownedIntent, approvePreparedCall } from "./tools.mjs";
import { deny } from "../accounts/model.mjs";
import { onlyFields } from "../accounts/auth-primitives.mjs";
import { providerSummary } from "../accounts/provider-control.mjs";
export async function agentWorkspaceRequest({
  database,
  account,
  path,
  method,
  readBody,
  origin,
  external = false,
  allowedCountries = ["US"],
  vaultKey,
}) {
  if (!path.startsWith("agents")) return null;
  const reply = (status, body) => ({ status, body });
  if (path === "agents" && method === "GET") {
    const state = await realContactState(database, account.id);
    const provider = await providerSummary(database, account.id, vaultKey);
    return reply(200, {
      mcp_url: new URL(
        "/mcp",
        external ? origin : "https://agentbridge.victor.ceo",
      ).href,
      external_mcp_available: external,
      scopes: AGENT_SCOPES,
      default_scopes: DEFAULT_AGENT_SCOPES,
      grants: await listAgentGrants(database, account.id),
      contacts: state.contacts,
      history_count: state.history.length,
      calling_countries: allowedCountries,
      setup: {
        provider_connected: provider.configured,
        live_enabled: provider.live_enabled,
        numbers: state.doc.routing_numbers.filter(
          (item) => item.status === "owned",
        ).length,
        contacts: state.contacts.length,
      },
      features: {
        native_grok_country: "US",
        provider_callback: true,
        browser_join: false,
        live_asr: false,
      },
      skill_url: new URL(
        "/agentbridge-skill.md",
        external ? origin : "https://agentbridge.victor.ceo",
      ).href,
    });
  }
  const grant = path.match(/^agents\/grants\/([a-f0-9-]{36})$/);
  if (grant && method === "DELETE") {
    onlyFields(await readBody(), []);
    return reply(200, await revokeAgentGrant(database, account.id, grant[1]));
  }
  const request = path.match(/^agents\/requests\/([a-f0-9-]{36})$/);
  if (request && method === "GET")
    return reply(200, {
      request: await agentRequestView(database, request[1]),
    });
  if (path === "agents/authorize" && method === "POST") {
    if (!external)
      deny(
        409,
        "PUBLIC_HOST_REQUIRED",
        "Authorize agents on the public AgentBridge service.",
      );
    return reply(
      200,
      await approveAgentRequest(database, account, await readBody(), origin),
    );
  }
  if (path === "agents/contacts" && method === "GET")
    return reply(200, {
      contacts: (await realContactState(database, account.id)).contacts,
    });
  if (path === "agents/contacts" && method === "POST")
    return reply(
      201,
      await saveRealContact(database, account, await readBody()),
    );
  const contact = path.match(/^agents\/contacts\/(ct_[a-f0-9]{24})$/);
  if (contact && method === "DELETE") {
    onlyFields(await readBody(), []);
    const changed = await database.run(
      "DELETE FROM ab_contacts WHERE id=? AND account_id=?",
      [contact[1], account.id],
    );
    if (!changed.changes)
      deny(404, "CONTACT_NOT_FOUND", "Saved contact not found.");
    return reply(200, {
      deleted: true,
      note: "Existing call history remains until it is deleted separately.",
    });
  }
  if (path === "agents/history" && method === "GET")
    return reply(200, {
      calls: (await realContactState(database, account.id)).history,
    });
  const call = path.match(
    /^agents\/calls\/([a-f0-9-]{36})(?:\/(approve|cancel))?$/,
  );
  if (call) {
    const plan = await ownedIntent(database, account.id, call[1]);
    if (method === "GET" && !call[2])
      return reply(200, {
        call: {
          id: plan.id,
          status: plan.status,
          expires_at: plan.expires_at,
          ...plan.data,
        },
      });
    if (method === "POST" && call[2] === "approve")
      return reply(
        200,
        await approvePreparedCall({
          database,
          account,
          input: { ...(await readBody()), prepared_call_id: plan.id },
          allowedCountries,
        }),
      );
    if (method === "POST" && call[2] === "cancel") {
      onlyFields(await readBody(), []);
      const changed = await database.run(
        "UPDATE ab_call_intents SET status='cancelled',updated_at=? WHERE id=? AND account_id=? AND status IN ('prepared','approved')",
        [new Date().toISOString(), plan.id, account.id],
      );
      if (!changed.changes)
        deny(
          409,
          "CANNOT_CANCEL",
          "This call cannot be cancelled from preparation. Use its live call controls.",
        );
      return reply(200, { cancelled: true });
    }
  }
  deny(404, "NOT_FOUND", "Agent endpoint not found.");
}
