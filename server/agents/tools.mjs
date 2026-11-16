import { onlyFields, authLimit } from "../accounts/auth-primitives.mjs";
import { deny, AccountError } from "../accounts/model.mjs";
import { canonicalPhone } from "../../shared/phone.mjs";
import {
  realContactState,
  resolveRealContact,
  briefForContact,
  saveRealContact,
} from "./contacts.mjs";
import { requireScope } from "./access.mjs";
import {
  providerSummary,
  connectedProvider,
} from "../accounts/provider-control.mjs";
import { ownCall, callView } from "../accounts/live-calls.mjs";
import { liveWorkspaceRequest } from "../accounts/live-workspace.mjs";

const string = (description, maxLength = 200) => ({
  type: "string",
  description,
  maxLength,
});
const schema = (properties) => ({
  type: "object",
  properties,
  additionalProperties: false,
});
const args = (properties, required = []) => ({
  ...schema(properties),
  required,
});
export const AGENT_TOOLS = [
  {
    name: "get_agentbridge_setup",
    description:
      "Read calling setup and real feature availability for your signed-in AgentBridge account. No provider secrets or paid actions.",
    scope: "contacts:read",
    readOnly: true,
    inputSchema: args({}),
  },
  {
    name: "prepare_call",
    description:
      "Use before calling a contact or phone number. Resolves the real contact and returns saved notes, previous conversations, follow-ups, calling readiness and a prepared call ID together. Never dials or buys a number. Demo data is excluded.",
    scope: "calls:prepare",
    readOnly: false,
    inputSchema: args(
      {
        target: string("Contact ID, exact saved name or phone number"),
        purpose: string("What to discuss", 500),
        country: string(
          "Two-letter country for a national-format phone number",
          2,
        ),
        transport: {
          type: "string",
          enum: ["native_grok", "callback"],
          description:
            "native_grok uses the host native confirmed US calling tool. callback needs live provider setup and separate studio approval.",
        },
      },
      ["target"],
    ),
  },
  {
    name: "get_contact_history",
    description:
      "Read previous calls and source-labelled conversation context for one of your real contacts.",
    scope: "history:read",
    readOnly: true,
    inputSchema: args(
      {
        contact_id: string("Contact ID from prepare_call", 100),
        offset: { type: "integer", minimum: 0, maximum: 10000 },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      ["contact_id"],
    ),
  },
  {
    name: "save_contact",
    description:
      "Save a contact and explicit user-provided notes for future calls. Does not purchase a number or change forwarding.",
    scope: "contacts:write",
    readOnly: false,
    inputSchema: args(
      {
        name: string("Contact name", 80),
        number: string("Phone number", 80),
        country: string("Two-letter country if needed", 2),
        notes: string("Contact notes explicitly supplied by the user", 2000),
      },
      ["name", "number"],
    ),
  },
  {
    name: "save_call_outcome",
    description:
      "After an actual call, save a concise agent-reported outcome and follow-ups for its prepared call ID. Never claim an unavailable recording/transcript or carrier verification.",
    scope: "outcomes:write",
    readOnly: false,
    inputSchema: args(
      {
        prepared_call_id: string("Prepared call ID", 100),
        summary: string("Source-labelled report of what happened", 4000),
        follow_ups: {
          type: "array",
          maxItems: 8,
          items: string("Follow-up", 250),
        },
        outcome: { type: "string", enum: ["completed", "no_answer", "failed"] },
        duration_seconds: { type: "integer", minimum: 0, maximum: 86400 },
        external_reference: string(
          "Optional host call reference, not a credential or recording URL",
          200,
        ),
      },
      ["prepared_call_id", "summary"],
    ),
  },
  {
    name: "get_call_status",
    description:
      "Read a prepared call or approved provider callback status and its Studio link. Agent-reported status is distinguished from provider status.",
    scope: "calls:read",
    readOnly: true,
    inputSchema: args({ prepared_call_id: string("Prepared call ID", 100) }, [
      "prepared_call_id",
    ]),
  },
  {
    name: "start_call",
    description:
      "Start a provider callback that the account owner has already approved in the AgentBridge studio. Native Grok calls must use the host native confirmation/calling tool instead. A token cannot approve its own call. Retries reuse the same durable provider request.",
    scope: "calls:request",
    readOnly: false,
    inputSchema: args(
      { prepared_call_id: string("Approved prepared call ID", 100) },
      ["prepared_call_id"],
    ),
  },
];
const safeText = (value, max) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export async function ownedIntent(database, accountId, id) {
  const row = await database.first(
    "SELECT * FROM ab_call_intents WHERE id=? AND account_id=?",
    [id, accountId],
  );
  if (!row) deny(404, "CALL_NOT_FOUND", "Prepared call not found.");
  return { ...row, data: JSON.parse(row.document) };
}
const compactBrief = (brief) => ({
  ...brief,
  previous_calls: brief.previous_calls.slice(0, 5).map((call) => ({
    ...call,
    summary: call.summary?.slice(0, 1200) || null,
    follow_ups: call.follow_ups.slice(0, 5),
    notes: call.notes
      .slice(-3)
      .map((note) => ({ ...note, text: note.text.slice(0, 500) })),
    transcript_excerpt: call.transcript_excerpt.map((line) => ({
      ...line,
      text: line.text.slice(0, 500),
    })),
  })),
});
export async function prepareAgentCall({
  database,
  actor,
  input,
  origin,
  vaultKey,
  allowedCountries = ["US"],
}) {
  onlyFields(input, ["target", "purpose", "country", "transport"]);
  if (input.purpose !== undefined && !safeText(input.purpose, 500))
    deny(
      422,
      "INVALID_PURPOSE",
      "Keep the call purpose within 500 characters.",
    );
  if (input.country !== undefined && !/^[A-Za-z]{2}$/.test(input.country))
    deny(422, "INVALID_COUNTRY", "Choose a two-letter country.");
  const transport = input.transport || "native_grok";
  if (!["native_grok", "callback"].includes(transport))
    deny(422, "INVALID_TRANSPORT", "Choose native_grok or callback.");
  if (transport === "callback") requireScope(actor, "calls:request");
  requireScope(actor, "contacts:read");
  requireScope(actor, "history:read");
  const resolved = await resolveRealContact(
    database,
    actor.account,
    input.target,
    input.country,
  );
  if (!resolved.match)
    return {
      ready: false,
      next_action: resolved.action,
      candidates: resolved.candidates,
      call_started: false,
    };
  const contact = resolved.match,
    provider = await providerSummary(database, actor.account.id, vaultKey);
  const connection = resolved.state.doc.connections?.find(
    (item) =>
      item.status === "saved" &&
      canonicalPhone(item.destination)?.e164 === contact.number,
  );
  const nativePermitted = contact.country === "US";
  let readiness =
    transport === "native_grok"
      ? nativePermitted
        ? "native_confirmation_required"
        : "native_country_unsupported"
      : !provider.configured
        ? "connect_provider"
        : !provider.live_enabled
          ? "enable_live_mode"
          : !allowedCountries.includes(contact.country)
            ? "provider_country_disabled"
            : !connection
              ? "connect_destination"
              : "studio_approval_required";
  const id = crypto.randomUUID(),
    stamp = new Date().toISOString(),
    expires = Date.now() + 15 * 60_000;
  const document = {
    contact,
    transport,
    purpose: input.purpose || "",
    connection_id: connection?.id || null,
    destination: contact.number,
    readiness,
    known_contact: resolved.known,
    operation_id: crypto.randomUUID(),
    max_duration_seconds: 300,
    provider_call_id: null,
  };
  const count = await database.first(
    "SELECT COUNT(*) AS n FROM ab_call_intents WHERE account_id=? AND expires_at>?",
    [actor.account.id, Date.now()],
  );
  if (count.n >= 100)
    deny(
      409,
      "PREPARATION_LIMIT",
      "Finish or wait for older preparations to expire.",
    );
  await database.run(
    "INSERT INTO ab_call_intents(id,account_id,grant_id,document,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      id,
      actor.account.id,
      actor.grantId,
      JSON.stringify(document),
      "prepared",
      expires,
      stamp,
      stamp,
    ],
  );
  return {
    prepared_call_id: id,
    known_contact: resolved.known,
    contact: {
      id: contact.id,
      name: contact.name,
      number: contact.number,
      country: contact.country,
    },
    brief: compactBrief(briefForContact(resolved.state, contact)),
    transport,
    ready: readiness === "native_confirmation_required",
    next_action: readiness,
    call_started: false,
    expires_at: expires,
    approval_url: new URL("/studio/agents/?call=" + id, origin).href,
    studio_url: new URL("/studio/calls/", origin).href,
    instructions:
      transport === "native_grok"
        ? nativePermitted
          ? "Use the host native calling tool with its required user confirmation and this exact destination. Use the saved brief during the call, then save the actual outcome."
          : "Grok Bot native calling is documented as US-only. Do not use a bridge access number to bypass that restriction."
        : "The owner must approve the callback number, destination and provider charges in the Studio. This preparation does not call anyone.",
  };
}
export async function approvePreparedCall({
  database,
  account,
  input,
  allowedCountries = ["US"],
}) {
  onlyFields(input, ["prepared_call_id", "callback_number", "confirm_charges"]);
  const plan = await ownedIntent(database, account.id, input.prepared_call_id);
  if (
    plan.expires_at <= Date.now() ||
    !["prepared", "approved"].includes(plan.status)
  )
    deny(409, "CALL_EXPIRED", "Prepare the call again.");
  if (plan.data.transport !== "callback" || input.confirm_charges !== true)
    deny(
      422,
      "APPROVAL_REQUIRED",
      "Approve a provider callback and its charges explicitly.",
    );
  const callback = canonicalPhone(input.callback_number);
  if (
    !callback ||
    !allowedCountries.includes(callback.country) ||
    !allowedCountries.includes(plan.data.contact.country)
  )
    deny(
      422,
      "COUNTRY_DISABLED",
      "This callback or destination country is not enabled on this deployment.",
    );
  const state = await realContactState(database, account.id),
    connection = state.doc.connections?.find(
      (item) => item.id === plan.data.connection_id && item.status === "saved",
    );
  if (!connection || connection.destination !== plan.data.destination)
    deny(
      409,
      "CONNECTION_CHANGED",
      "The connection changed. Prepare the call again.",
    );
  if (
    callback.e164 === plan.data.destination ||
    state.doc.routing_numbers?.some((number) => number.e164 === callback.e164)
  )
    deny(
      422,
      "INVALID_CALLBACK",
      "Use your own separate outside phone for the callback.",
    );
  const document = {
    ...plan.data,
    callback_number: callback.e164,
    approved_at: new Date().toISOString(),
  };
  await database.run(
    "UPDATE ab_call_intents SET document=?,status='approved',updated_at=? WHERE id=? AND account_id=? AND status IN ('prepared','approved')",
    [JSON.stringify(document), new Date().toISOString(), plan.id, account.id],
  );
  return {
    approved: true,
    prepared_call_id: plan.id,
    destination: plan.data.destination,
    callback_number: callback.e164,
  };
}
async function startPreparedCall({
  database,
  actor,
  input,
  origin,
  vaultKey,
  fetcher,
  allowedCountries,
}) {
  onlyFields(input, ["prepared_call_id"]);
  const plan = await ownedIntent(
    database,
    actor.account.id,
    input.prepared_call_id,
  );
  if (plan.grant_id !== actor.grantId)
    deny(
      403,
      "WRONG_CONNECTION",
      "Use the app connection that prepared this call.",
    );
  if (plan.data.transport !== "callback")
    deny(
      409,
      "NATIVE_CALL_REQUIRED",
      "Use the native Grok calling tool and its confirmation for this prepared call.",
    );
  if (["started", "dispatching", "unknown"].includes(plan.status))
    return {
      prepared_call_id: plan.id,
      status: plan.status,
      call_id: plan.data.provider_call_id || null,
      retry_allowed: false,
      studio_url: new URL("/studio/calls/", origin).href,
    };
  if (plan.status !== "approved" || plan.expires_at <= Date.now())
    deny(
      409,
      "OWNER_APPROVAL_REQUIRED",
      "Approve the callback in the studio before starting it.",
    );
  if (!allowedCountries.includes(plan.data.contact.country))
    deny(409, "COUNTRY_DISABLED", "The destination country is disabled.");
  const state = await realContactState(database, actor.account.id),
    connection = state.doc.connections.find(
      (item) => item.id === plan.data.connection_id && item.status === "saved",
    );
  if (!connection || connection.destination !== plan.data.destination)
    deny(
      409,
      "CONNECTION_CHANGED",
      "The connection changed. Prepare and approve a new call.",
    );
  const claimed = await database.run(
    "UPDATE ab_call_intents SET status='dispatching',updated_at=? WHERE id=? AND status='approved' AND expires_at>?",
    [new Date().toISOString(), plan.id, Date.now()],
  );
  if (!claimed.changes)
    deny(409, "CALL_IN_PROGRESS", "This callback is already being dispatched.");
  try {
    const result = await liveWorkspaceRequest({
      database,
      account: actor.account,
      path: "calls/start",
      method: "POST",
      vaultKey,
      fetcher,
      readBody: async () => ({
        request_id: plan.data.operation_id,
        connection_id: plan.data.connection_id,
        callback_number: plan.data.callback_number,
        confirm_charges: true,
      }),
    });
    const document = { ...plan.data, provider_call_id: result.body.call.id };
    await database.run(
      "UPDATE ab_call_intents SET document=?,status='started',updated_at=? WHERE id=?",
      [JSON.stringify(document), new Date().toISOString(), plan.id],
    );
    return {
      prepared_call_id: plan.id,
      call_id: result.body.call.id,
      status: result.body.call.status,
      source: "signalwire",
      studio_url: new URL("/studio/calls/", origin).href,
    };
  } catch (error) {
    await database.run(
      "UPDATE ab_call_intents SET status='unknown',updated_at=? WHERE id=?",
      [new Date().toISOString(), plan.id],
    );
    throw error;
  }
}
async function saveOutcome({ database, actor, input }) {
  onlyFields(input, [
    "prepared_call_id",
    "summary",
    "follow_ups",
    "outcome",
    "duration_seconds",
    "external_reference",
  ]);
  if (
    !safeText(input.summary, 4000) ||
    (input.follow_ups !== undefined &&
      (!Array.isArray(input.follow_ups) ||
        input.follow_ups.length > 8 ||
        input.follow_ups.some((item) => !safeText(item, 250)))) ||
    (input.duration_seconds !== undefined &&
      (!Number.isInteger(input.duration_seconds) ||
        input.duration_seconds < 0 ||
        input.duration_seconds > 86400)) ||
    (input.outcome !== undefined &&
      !["completed", "no_answer", "failed"].includes(input.outcome)) ||
    (input.external_reference !== undefined &&
      !safeText(input.external_reference, 200))
  )
    deny(
      422,
      "INVALID_OUTCOME",
      "Enter a bounded summary, follow-ups and call outcome.",
    );
  const plan = await ownedIntent(
    database,
    actor.account.id,
    input.prepared_call_id,
  );
  if (plan.grant_id !== actor.grantId)
    deny(
      403,
      "WRONG_CONNECTION",
      "Only the app that prepared this call can report its outcome.",
    );
  if (
    plan.data.transport === "callback" &&
    ![
      "started",
      "reported_completed",
      "reported_no_answer",
      "reported_failed",
    ].includes(plan.status)
  )
    deny(409, "CALL_NOT_STARTED", "This provider call has not started.");
  if (plan.status === "cancelled")
    deny(409, "CALL_CANCELLED", "This preparation was cancelled.");
  const previous = await database.first(
    "SELECT id,created_at FROM ab_call_outcomes WHERE intent_id=? AND account_id=?",
    [plan.id, actor.account.id],
  );
  const stamp = new Date().toISOString(),
    id = previous?.id || crypto.randomUUID();
  const report = {
    id,
    prepared_call_id: plan.id,
    label: plan.data.contact.name,
    destination: plan.data.destination,
    contact_id: plan.data.contact.id,
    summary: input.summary.trim(),
    follow_ups: (input.follow_ups || []).map((item) => item.trim()),
    status: "reported_" + (input.outcome || "completed"),
    duration: input.duration_seconds || 0,
    started_at: plan.created_at,
    created_at: previous?.created_at || stamp,
    source: "agent_reported",
    verified: false,
    has_recording: false,
    has_transcript: false,
    notes: [],
    external_reference: input.external_reference || null,
  };
  await database.batch([
    {
      sql: "INSERT INTO ab_call_outcomes(id,account_id,intent_id,destination,document,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(intent_id) DO UPDATE SET document=excluded.document,updated_at=excluded.updated_at",
      params: [
        id,
        actor.account.id,
        plan.id,
        plan.data.destination,
        JSON.stringify(report),
        report.created_at,
        stamp,
      ],
    },
    {
      sql: "UPDATE ab_call_intents SET status=?,updated_at=? WHERE id=? AND account_id=?",
      params: [report.status, stamp, plan.id, actor.account.id],
    },
  ]);
  return {
    saved: true,
    call_id: id,
    source: "agent_reported",
    carrier_verified: false,
  };
}
export async function runAgentTool(context, name, input = {}) {
  const tool = AGENT_TOOLS.find((tool) => tool.name === name);
  if (!tool) deny(404, "UNKNOWN_TOOL", "Unknown AgentBridge tool.");
  requireScope(context.actor, tool.scope);
  await authLimit(context.database, "agent-tool:" + context.actor.account.id, {
    maximum: 120,
    window: 60_000,
  });
  switch (name) {
    case "get_agentbridge_setup": {
      const provider = await providerSummary(
        context.database,
        context.actor.account.id,
        context.vaultKey,
      );
      return {
        account_connected: true,
        mcp: true,
        native_grok: {
          calling_countries: ["US"],
          confirmation_required: true,
          voice_interoperability_verified: false,
        },
        provider: {
          configured: provider.configured,
          live_enabled: provider.live_enabled,
        },
        human_join: false,
        live_asr: false,
        calling_countries: context.allowedCountries || ["US"],
        studio_url: new URL("/studio/agents/", context.origin).href,
      };
    }
    case "prepare_call":
      return prepareAgentCall({ ...context, input });
    case "save_contact":
      return saveRealContact(context.database, context.actor.account, input);
    case "get_contact_history": {
      onlyFields(input, ["contact_id", "offset", "limit"]);
      const state = await realContactState(
          context.database,
          context.actor.account.id,
        ),
        contact = state.contacts.find((item) => item.id === input.contact_id);
      if (!contact) deny(404, "CONTACT_NOT_FOUND", "Contact not found.");
      const offset = input.offset ?? 0,
        limit = input.limit ?? 5;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 10000 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 10
      )
        deny(422, "INVALID_PAGE", "Choose a valid history page.");
      const calls = state.history.filter(
        (call) =>
          canonicalPhone(call.destination || call.to)?.e164 === contact.number,
      );
      return {
        contact: { id: contact.id, name: contact.name, number: contact.number },
        calls: calls.slice(offset, offset + limit).map((call) => ({
          id: call.id,
          started_at: call.started_at,
          status: call.status,
          duration: call.duration || 0,
          summary: call.summary || null,
          follow_ups: call.follow_ups || [],
          source: call.source,
          verified: call.verified === true,
          notes: (call.notes || []).slice(-3),
          has_recording: call.has_recording === true,
          has_transcript: call.has_transcript === true,
        })),
        next_offset: offset + limit < calls.length ? offset + limit : null,
      };
    }
    case "save_call_outcome":
      return saveOutcome({ ...context, input });
    case "start_call":
      return startPreparedCall({
        ...context,
        input,
        allowedCountries: context.allowedCountries || ["US"],
      });
    case "get_call_status": {
      onlyFields(input, ["prepared_call_id"]);
      const plan = await ownedIntent(
        context.database,
        context.actor.account.id,
        input.prepared_call_id,
      );
      let providerStatus = null;
      if (plan.data.provider_call_id) {
        const state = await realContactState(
          context.database,
          context.actor.account.id,
        );
        const { client } = await connectedProvider(
          context.database,
          context.actor.account.id,
          context.vaultKey,
          context.fetcher,
        );
        providerStatus = callView(
          await ownCall(client, state.doc, plan.data.provider_call_id),
        );
      }
      return {
        prepared_call_id: plan.id,
        status: providerStatus?.status || plan.status,
        source: providerStatus
          ? "signalwire"
          : plan.status.startsWith("reported_")
            ? "agent_reported"
            : "preparation",
        carrier_verified: Boolean(providerStatus),
        expires_at: plan.expires_at,
        studio_url: new URL("/studio/calls/", context.origin).href,
      };
    }
  }
}
