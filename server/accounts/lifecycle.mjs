import { deny, publicAccount } from "./model.mjs";
import { onlyFields, authLimit } from "./auth-primitives.mjs";
import { providerLease } from "./provider-control.mjs";
import { realContactState } from "../agents/contacts.mjs";
import { listAgentGrants } from "../agents/access.mjs";
import { savedTranscripts } from "./transcription.mjs";

export async function exportAccount(database, account) {
  const demo = await database.first(
    "SELECT document FROM ab_workspaces WHERE account_id=?",
    [account.id],
  );
  const live = await realContactState(database, account.id);
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    account: publicAccount(account),
    demo_workspace: demo ? JSON.parse(demo.document) : null,
    live_workspace: live.doc,
    contacts: live.contacts,
    call_history: live.history,
    transcripts: await savedTranscripts(database, account.id),
    connected_apps: await listAgentGrants(database, account.id),
    media_notice:
      "Recordings remain in your SignalWire project. API keys, passwords, session tokens and OAuth tokens are excluded.",
  };
}
export async function deleteAccount({
  database,
  account,
  input,
  passwords,
  platformIdentity,
}) {
  onlyFields(input, ["confirmation", "password"]);
  if (input.confirmation !== "DELETE")
    deny(
      422,
      "CONFIRM_DELETE",
      "Type DELETE to permanently remove your account and AgentBridge data.",
    );
  await authLimit(database, "account-delete:" + account.id, {
    maximum: 5,
    window: 15 * 60_000,
  });
  if (
    !platformIdentity &&
    (typeof input.password !== "string" ||
      input.password.length > 128 ||
      !(await passwords.verify(input.password, account.password_hash)))
  )
    deny(401, "INVALID_PASSWORD", "Enter your current account password.");
  return providerLease(database, account.id, async () => {
    const provider = await database.first(
      "SELECT account_id FROM ab_provider_connections WHERE account_id=?",
      [account.id],
    );
    if (provider)
      deny(
        409,
        "DISCONNECT_PROVIDER_FIRST",
        "Deactivate your routes, end active calls and disconnect SignalWire before deleting your account. Your carrier numbers and billing remain with SignalWire.",
      );
    const busy = await database.first(
      "SELECT id FROM ab_transcription_jobs WHERE account_id=? AND status='pending'",
      [account.id],
    );
    if (busy)
      deny(
        409,
        "TRANSCRIPTION_PENDING",
        "Wait for your transcription to finish before deleting your account.",
      );
    await database.batch([
      {
        sql: "DELETE FROM ab_email_tokens WHERE email=?",
        params: [account.email],
      },
      { sql: "DELETE FROM ab_accounts WHERE id=?", params: [account.id] },
    ]);
    return {
      deleted: true,
      redirect: platformIdentity ? "/signout-with-chatgpt?return_to=%2F" : "/",
    };
  });
}
