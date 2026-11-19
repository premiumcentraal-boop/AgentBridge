// Disposable actual Wrangler D1 regression for the three-statement owner recovery batch.
// Run: npm --prefix backend ci && node --test test/d1-force-unlock-local.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getPlatformProxy} from '../backend/node_modules/wrangler/wrangler-dist/cli.js';

// This test intentionally uses a real local D1 binding rather than the Node
// mock's batch implementation. No remote account, carrier or paid route exists.
test('local Wrangler D1 force-unlock batch is atomic when audit is ignored',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'agentbridge-d1-recovery-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  const configPath=join(dir,'wrangler.toml');
  await writeFile(configPath, `name = "agentbridge-recovery-regression"
main = "worker.mjs"
compatibility_date = "2026-11-01"
[[d1_databases]]
binding = "DB"
database_name = "disposable-recovery"
database_id = "00000000-0000-4000-8000-000000000001"
`);
  await writeFile(join(dir,'worker.mjs'),'export default {fetch(){return new Response("offline")}};');
  const proxy=await getPlatformProxy({configPath,persist:{path:join(dir,'state')}});
  t.after(async()=>proxy.dispose());
  const db=proxy.env.DB;
  await db.exec(`CREATE TABLE reservations (id TEXT PRIMARY KEY,status TEXT NOT NULL);
CREATE TABLE owner_actions (id TEXT PRIMARY KEY,reservation_id TEXT NOT NULL,action TEXT NOT NULL,prior_status TEXT NOT NULL,carrier_code TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  const id='reservation-1',auditId='audit-1',reason='Manual dashboard review',code='CARRIER_FINALITY_UNVERIFIED',now=123;
  const seed=async()=>{
    await db.prepare('DELETE FROM owner_actions').run();
    await db.prepare('DELETE FROM reservations').run();
    await db.prepare("INSERT INTO reservations (id,status) VALUES (?,'connecting')").bind(id).run();
  };
  const batch=()=>db.batch([
    db.prepare("UPDATE reservations SET status='failed' WHERE id=? AND status='connecting'").bind(id),
    db.prepare("INSERT INTO owner_actions (id,reservation_id,action,prior_status,carrier_code,reason,created_at) SELECT ?,?,'force_unlock','connecting',?,?,? WHERE changes()=1").bind(auditId,id,code,reason,now),
    db.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM owner_actions WHERE id=? AND reservation_id=? AND action='force_unlock' AND prior_status='connecting' AND carrier_code=? AND reason=? AND created_at=?)=1 AND (SELECT COUNT(*) FROM reservations WHERE id=? AND status='failed')=1 THEN 1 ELSE abs(-9223372036854775807 - 1) END AS recovery_assertion").bind(auditId,id,code,reason,now,id)
  ]);
  const state=async()=>({
    status:(await db.prepare('SELECT status FROM reservations WHERE id=?').bind(id).first()).status,
    audits:(await db.prepare('SELECT COUNT(*) AS n FROM owner_actions').first()).n
  });
  await seed();
  await db.exec("CREATE TRIGGER ignore_audit BEFORE INSERT ON owner_actions BEGIN SELECT RAISE(IGNORE); END;");
  await assert.rejects(batch(),'ignored audit must abort the D1 batch');
  assert.deepEqual(await state(),{status:'connecting',audits:0},'no unaudited unlock may persist');
  await db.exec('DROP TRIGGER ignore_audit;');
  await seed();
  await batch();
  assert.deepEqual(await state(),{status:'failed',audits:1},'valid recovery commits audit and transition');
  await assert.rejects(batch(),'duplicate recovery must not append another audit');
  assert.deepEqual(await state(),{status:'failed',audits:1},'duplicate does not change durable state');
});
