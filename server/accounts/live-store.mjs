import { deny } from "./model.mjs";
export const stamp = () => new Date().toISOString();
export function emptyLiveWorkspace() {
  return {
    routing_numbers: [],
    connections: [],
    calls: [],
    recordings: [],
    transcriptions: [],
    events: [],
    last_sync: null,
    inventory_has_more: false,
  };
}
export async function readLive(database, accountId) {
  const row = await database.first(
    "SELECT document FROM ab_live_workspaces WHERE account_id=?",
    [accountId],
  );
  return row ? JSON.parse(row.document) : emptyLiveWorkspace();
}
export async function changeLive(database, accountId, update) {
  for (let tries = 0; tries < 5; tries++) {
    const row = await database.first(
      "SELECT document,revision FROM ab_live_workspaces WHERE account_id=?",
      [accountId],
    );
    if (!row) deny(409, "PROVIDER_REQUIRED", "Connect SignalWire first.");
    const document = JSON.parse(row.document);
    const result = update(document);
    const json = JSON.stringify(document);
    if (new TextEncoder().encode(json).length > 1_000_000)
      deny(409, "WORKSPACE_LIMIT", "Archive older records before adding more.");
    const saved = await database.run(
      "UPDATE ab_live_workspaces SET document=?,revision=revision+1,updated_at=? WHERE account_id=? AND revision=?",
      [json, stamp(), accountId, row.revision],
    );
    if (saved.changes) return result;
  }
  deny(
    409,
    "CONCURRENT_UPDATE",
    "The workspace changed. Refresh and try again.",
  );
}
export const liveEvent = (document, type, message) => {
  document.events = [
    { id: crypto.randomUUID(), type, message, created_at: stamp() },
    ...document.events,
  ].slice(0, 200);
};
