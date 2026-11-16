import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { backupAccounts } from "../../scripts/backup-accounts.mjs";
import { openAccountDatabase } from "../accounts/node-database.mjs";
import {
  sealCredential,
  openCredential,
} from "../accounts/credential-vault.mjs";
test("a consistent private backup restores account data and encrypted credentials without overwriting an earlier backup", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ab-backup-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "accounts.sqlite"),
    copy = join(directory, "backup.sqlite"),
    database = openAccountDatabase(source),
    id = randomUUID(),
    key = randomBytes(32).toString("hex"),
    now = new Date().toISOString();
  t.after(() => database.close());
  await database.run(
    "INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    [id, "tester@example.com", "Tester", "Agent", "password", now, now],
  );
  await database.run(
    "INSERT INTO ab_transcription_credentials(account_id,encrypted_secret,updated_at) VALUES(?,?,?)",
    [
      id,
      await sealCredential(
        { api_key: "test-only-asr-secret" },
        key,
        id,
        "transcription",
      ),
      now,
    ],
  );
  await backupAccounts(source, copy);
  assert.equal((await stat(copy)).mode & 0o777, 0o600);
  const restored = openAccountDatabase(copy);
  t.after(() => restored.close());
  assert.equal(
    (await restored.first("SELECT email FROM ab_accounts")).email,
    "tester@example.com",
  );
  const row = await restored.first(
    "SELECT encrypted_secret FROM ab_transcription_credentials",
  );
  assert.equal(
    (await openCredential(row.encrypted_secret, key, id, "transcription"))
      .api_key,
    "test-only-asr-secret",
  );
  await assert.rejects(backupAccounts(source, copy));
  assert.equal(
    (await restored.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    1,
  );
});
