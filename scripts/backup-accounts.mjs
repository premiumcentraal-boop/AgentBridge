import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, mkdtemp, chmod, link, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
export async function backupAccounts(source, destination) {
  const input = resolve(source),
    output = resolve(destination);
  if (input === output)
    throw new Error("The backup must use a different file.");
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(
    join(dirname(output), ".agentbridge-backup-"),
  );
  await chmod(temporary, 0o700);
  const filename = join(temporary, "accounts.sqlite"),
    db = new DatabaseSync(input, { readOnly: true });
  try {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw new Error("The source database did not pass its integrity check.");
    await backup(db, filename);
    await chmod(filename, 0o600);
    const check = new DatabaseSync(filename, { readOnly: true });
    try {
      if (
        check.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
        check.prepare("PRAGMA foreign_key_check").all().length
      )
        throw new Error("The backup did not pass verification.");
    } finally {
      check.close();
    }
    // Atomic, non-overwriting publication; temporary files stay private.
    await link(filename, output);
    return output;
  } finally {
    db.close();
    await rm(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv[2] || !process.argv[3]) {
    console.error(
      "Usage: node scripts/backup-accounts.mjs /data/accounts.sqlite /private-backups/accounts-date.sqlite",
    );
    process.exitCode = 2;
  } else
    try {
      await backupAccounts(process.argv[2], process.argv[3]);
      console.log(
        "Account database backup verified. Keep it private and retain the credential wrapping key separately.",
      );
    } catch {
      console.error(
        "Backup failed. Check source integrity, destination permissions and that the output file does not already exist.",
      );
      process.exitCode = 1;
    }
}
