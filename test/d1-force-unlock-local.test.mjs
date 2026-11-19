// Disposable actual Wrangler D1 regression for the three-statement owner recovery batch.
// Run: npm --prefix backend ci && node --test test/d1-force-unlock-local.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const backendRequire=createRequire(new URL('../backend/package.json',import.meta.url));
const {getPlatformProxy}=backendRequire('wrangler');

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
  const batch=(currentAuditId=auditId)=>db.batch([
    db.prepare("UPDATE reservations SET status='failed' WHERE id=? AND status='connecting'").bind(id),
    db.prepare("INSERT INTO owner_actions (id,reservation_id,action,prior_status,carrier_code,reason,created_at) SELECT ?,?,'force_unlock','connecting',?,?,? WHERE changes()=1").bind(currentAuditId,id,code,reason,now),
    db.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM owner_actions WHERE id=? AND reservation_id=? AND action='force_unlock' AND prior_status='connecting' AND carrier_code=? AND reason=? AND created_at=?)=1 AND changes()=1 AND (SELECT COUNT(*) FROM reservations WHERE id=? AND status='failed')=1 THEN 1 ELSE abs(-9223372036854775807 - 1) END AS recovery_assertion").bind(currentAuditId,id,code,reason,now,id)
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
  // Independently submitted D1 batches with different audit IDs must never
  // both recover the same reservation. This tests actual local D1 scheduling,
  // not the in-memory Node batch mock.
  await seed();
  const raced=await Promise.allSettled([batch('race-a'),batch('race-b')]);
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,1,
    'exactly one racing recovery may commit');
  assert.equal(raced.filter(x=>x.status==='rejected').length,1,
    'losing recovery must reject, not silently succeed');
  assert.deepEqual(await state(),{status:'failed',audits:1},
    'racing recovery must produce one durable transition and audit');
  // An explicit audit failure must also roll back the preceding UPDATE.
  await seed();
  await db.exec("CREATE TRIGGER abort_audit BEFORE INSERT ON owner_actions BEGIN SELECT RAISE(ABORT, 'audit rejected'); END;");
  await assert.rejects(batch('abort-audit'),'failed audit must abort the D1 batch');
  assert.deepEqual(await state(),{status:'connecting',audits:0},
    'explicit audit failure must not leave an unaudited unlock');
  await db.exec('DROP TRIGGER abort_audit;');
  await seed();
  await batch();
  await assert.rejects(batch(),'duplicate recovery must not append another audit');
  assert.deepEqual(await state(),{status:'failed',audits:1},'duplicate does not change durable state');
});
