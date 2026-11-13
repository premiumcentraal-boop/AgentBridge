import { DEFAULT_CAPTURE } from '../../shared/call-plans.mjs';
export const publicAccount = account => account ? { id: account.id, email: account.email, name: account.name, agent_name: account.agent_name, mode: 'demo', created_at: account.created_at } : null;
export function emptyWorkspace() {
  return {
    routing_numbers: [], connections: [], number_orders: [], call_plans: [], routes: [], events: [],
    settings: { experience: 'simple' }, capture_preferences: { ...DEFAULT_CAPTURE },
    demo_call: { active: false, muted: false, elapsed: 0, joined: false, userMuted: true, recording: false, transcription: false, recordingPaused: false },
  };
}
export function accountSnapshot(document, account) {
  const call = document.demo_call || { active: false };
  return { ...document, account: publicAccount(account), demo_call: { ...call, elapsed: call.active && call.started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(call.started_at)) / 1000)) : call.elapsed || 0 }, mode: 'demo', sandbox: true, integration_configured: false, routing_enabled: false, purchase_enabled: false, calling_enabled: false, recording_enabled: false, joining_enabled: false };
}
export function addEvent(document, type, message) {
  document.events = [{ id: crypto.randomUUID(), type, message, created_at: new Date().toISOString() }, ...document.events].slice(0, 200);
}
export class AccountError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function deny(status, code, message) { throw new AccountError(status, code, message); }
export async function mutateWorkspace(database, accountId, update) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await database.first('SELECT document, revision FROM ab_workspaces WHERE account_id=?', [accountId]);
    if (!row) deny(404, 'WORKSPACE_NOT_FOUND', 'Your workspace was not found.');
    const document = JSON.parse(row.document);
    const result = update(document);
    if (result?.unchanged) return result.value;
    const json = JSON.stringify(document);
    if (new TextEncoder().encode(json).byteLength > 1_000_000) deny(409, 'WORKSPACE_LIMIT', 'The demo workspace limit has been reached.');
    const saved = await database.run('UPDATE ab_workspaces SET document=?,revision=revision+1,updated_at=? WHERE account_id=? AND revision=?', [json, new Date().toISOString(), accountId, row.revision]);
    if (saved.changes) return result;
  }
  deny(409, 'CONCURRENT_UPDATE', 'The workspace changed in another session. Please try again.');
}
