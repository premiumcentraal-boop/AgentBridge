import { deny } from "./model.mjs";
import { sealCredential, openCredential } from "./credential-vault.mjs";
import { forwardXml, ProviderError } from "./signalwire-client.mjs";
import { readLive, changeLive, liveEvent, stamp } from "./live-store.mjs";
const backupFields = [
  "call_handler",
  "call_request_url",
  "call_request_method",
  "call_fallback_url",
  "call_fallback_method",
  "call_status_callback_url",
  "call_status_callback_method",
  "call_laml_application_id",
  "call_relay_script_url",
  "call_relay_topic",
  "call_relay_topic_status_callback_url",
  "call_relay_context",
  "call_relay_context_status_callback_url",
  "call_relay_application",
  "call_relay_connector_id",
  "call_sip_endpoint_id",
  "call_verto_resource",
];
const supportedHandlers = new Set([
  "laml_webhooks",
  "laml_application",
  "relay_script",
  "relay_topic",
  "relay_context",
  "relay_application",
  "relay_connector",
  "relay_sip_endpoint",
  "relay_verto_endpoint",
]);
export async function liveConnection(database, accountId, id) {
  const doc = await readLive(database, accountId),
    connection = doc.connections.find(
      (c) => c.id === id && c.status === "saved",
    );
  const number = doc.routing_numbers.find(
    (n) =>
      n.id === connection?.routing_number_id &&
      n.status === "owned" &&
      n.ownership_source === "signalwire",
  );
  if (!connection || !number)
    deny(
      404,
      "CONNECTION_NOT_FOUND",
      "Choose a saved connection with an owned SignalWire number.",
    );
  if (doc.routing_numbers.some((n) => n.e164 === connection.destination))
    deny(
      422,
      "OWN_NUMBER_DESTINATION",
      "A destination cannot be one of your routing numbers.",
    );
  return { connection, number };
}
export async function activateForwarding({
  database,
  account,
  client,
  vaultKey,
  connectionId,
}) {
  const { connection, number } = await liveConnection(
    database,
    account.id,
    connectionId,
  );
  const previous = await database.first(
    "SELECT * FROM ab_live_routes WHERE account_id=? AND connection_id=?",
    [account.id, connectionId],
  );
  if (previous?.status === "active")
    return { connection_id: connectionId, routing_state: "active" };
  if (previous && previous.status !== "inactive")
    deny(
      409,
      "ROUTE_REVIEW_REQUIRED",
      "Refresh provider state before activating this connection again.",
    );
  const remote = await client.ownNumber(number.provider_number_id);
  if (remote.number !== number.e164)
    deny(
      409,
      "NUMBER_CHANGED",
      "The SignalWire number has changed. Refresh your inventory.",
    );
  if (remote.call_handler && !supportedHandlers.has(remote.call_handler))
    deny(
      409,
      "UNSUPPORTED_CALL_HANDLER",
      "This number uses a Call Fabric resource. Choose a webhook-based number or change its handler in SignalWire before activating forwarding.",
    );
  let backup = Object.fromEntries(
    backupFields
      .filter((key) => typeof remote[key] === "string")
      .map((key) => [key, remote[key]]),
  );
  if (
    !backup.call_handler ||
    (!backup.call_request_url && backup.call_handler === "laml_webhooks")
  ) {
    const closed = await client.createScript(
      "AgentBridge idle " + connectionId,
      "<Response><Hangup/></Response>",
    );
    backup = {
      call_handler: "laml_webhooks",
      call_request_url: closed.url,
      call_request_method: "POST",
    };
  }
  const script = await client.createScript(
    "AgentBridge route " + connectionId,
    forwardXml(connection.destination, number.e164),
  );
  const encrypted = await sealCredential(
    backup,
    vaultKey,
    account.id,
    "route:" + connectionId,
  );
  await database.run(
    "INSERT INTO ab_live_routes(account_id,connection_id,number_id,script_id,script_url,encrypted_previous_config,status,updated_at) VALUES(?,?,?,?,?,?,'configuring',?) ON CONFLICT(account_id,connection_id) DO UPDATE SET number_id=excluded.number_id,script_id=excluded.script_id,script_url=excluded.script_url,encrypted_previous_config=excluded.encrypted_previous_config,status='configuring',updated_at=excluded.updated_at",
    [
      account.id,
      connectionId,
      number.id,
      script.id,
      script.url,
      encrypted,
      stamp(),
    ],
  );
  try {
    await client.rest("/phone_numbers/" + number.provider_number_id, "PUT", {
      call_handler: "laml_webhooks",
      call_request_url: script.url,
      call_request_method: "POST",
    });
    const confirmed = await client.ownNumber(number.provider_number_id);
    if (
      confirmed.call_handler !== "laml_webhooks" ||
      confirmed.call_request_url !== script.url
    )
      throw new ProviderError(502, true);
    await database.run(
      "UPDATE ab_live_routes SET status='active',updated_at=? WHERE account_id=? AND connection_id=?",
      [stamp(), account.id, connectionId],
    );
    await changeLive(database, account.id, (d) => {
      liveEvent(
        d,
        "forwarding.activated",
        "SignalWire forwarding activated for " + number.e164 + ".",
      );
      return {};
    });
    return {
      connection_id: connectionId,
      routing_state: "active",
      routing_number: number.e164,
      destination: connection.destination,
      max_duration_seconds: 300,
    };
  } catch (error) {
    try {
      await database.run(
        "UPDATE ab_live_routes SET status='unknown',updated_at=? WHERE account_id=? AND connection_id=?",
        [stamp(), account.id, connectionId],
      );
    } catch {}
    throw error;
  }
}
export async function disableForwarding({
  database,
  account,
  client,
  vaultKey,
  connectionId,
}) {
  const route = await database.first(
    "SELECT * FROM ab_live_routes WHERE account_id=? AND connection_id=?",
    [account.id, connectionId],
  );
  if (!route || route.status === "inactive")
    return { connection_id: connectionId, routing_state: "inactive" };
  const doc = await readLive(database, account.id),
    number = doc.routing_numbers.find((n) => n.id === route.number_id);
  if (!number)
    deny(
      409,
      "NUMBER_MISSING",
      "Refresh your SignalWire inventory before deactivating this route.",
    );
  const current = await client.ownNumber(number.provider_number_id);
  // An external edit belongs to the customer. Never overwrite it on disconnect.
  if (
    current.call_handler !== "laml_webhooks" ||
    current.call_request_url !== route.script_url
  )
    deny(
      409,
      "PROVIDER_ROUTING_CHANGED",
      "Routing changed in SignalWire. Reconcile provider state before continuing.",
    );
  const backup = await openCredential(
    route.encrypted_previous_config,
    vaultKey,
    account.id,
    "route:" + connectionId,
  );
  await client.rest(
    "/phone_numbers/" + number.provider_number_id,
    "PUT",
    backup,
  );
  const verified = await client.ownNumber(number.provider_number_id);
  if (
    Object.entries(backup).some(
      ([key, value]) => String(verified[key] ?? "") !== value,
    )
  )
    throw new ProviderError(502, true);
  await database.run(
    "UPDATE ab_live_routes SET status='inactive',updated_at=? WHERE account_id=? AND connection_id=?",
    [stamp(), account.id, connectionId],
  );
  await changeLive(database, account.id, (d) => {
    liveEvent(
      d,
      "forwarding.deactivated",
      "Previous SignalWire call handling restored for " + number.e164 + ".",
    );
    return {};
  });
  // The script is no longer attached. Failure to remove it cannot reactivate it.
  try {
    await client.compat("/LamlBins/" + route.script_id, "DELETE");
  } catch {}
  return { connection_id: connectionId, routing_state: "inactive" };
}
export async function routeStates(database, accountId) {
  const result = await database.first(
    "SELECT json_group_array(json_object('connection_id',connection_id,'status',status)) AS entries FROM ab_live_routes WHERE account_id=?",
    [accountId],
  );
  return JSON.parse(result?.entries || "[]");
}
export async function reconcileForwarding({ database, account, client }) {
  const doc = await readLive(database, account.id),
    states = await routeStates(database, account.id);
  for (const state of states.filter((r) => r.status !== "inactive")) {
    const row = await database.first(
      "SELECT number_id,script_url FROM ab_live_routes WHERE account_id=? AND connection_id=?",
      [account.id, state.connection_id],
    );
    const number = doc.routing_numbers.find((n) => n.id === row.number_id);
    if (!number) continue;
    const remote = await client.ownNumber(number.provider_number_id);
    const active =
      remote.call_handler === "laml_webhooks" &&
      remote.call_request_url === row.script_url;
    await database.run(
      "UPDATE ab_live_routes SET status=?,updated_at=? WHERE account_id=? AND connection_id=?",
      [
        active ? "active" : "inactive",
        stamp(),
        account.id,
        state.connection_id,
      ],
    );
    // A direct provider read resolves ambiguous route writes. Existing completed
    // operations retain their original historical result.
    await database.run(
      "UPDATE ab_provider_operations SET status='failed',updated_at=? WHERE account_id=? AND target=? AND kind IN ('activate','deactivate') AND status IN ('pending','unknown')",
      [stamp(), account.id, state.connection_id],
    );
  }
  return { ok: true, routes: await routeStates(database, account.id) };
}
