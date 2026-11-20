// Disposable actual Wrangler D1 regression for the three-statement owner recovery batch.
// Run: npm --prefix backend ci && node --test test/d1-force-unlock-local.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {request as httpRequest} from 'node:http';
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
  // Cross-proxy isolation: a second Worker runtime with its own D1 binding
  // points at the same disposable persisted database. Verify shared visibility
  // before claiming this exercises independent bindings.
  const secondProxy=await getPlatformProxy({configPath,persist:{path:join(dir,'state')}});
  t.after(async()=>secondProxy.dispose());
  const secondDb=secondProxy.env.DB;
  await seed();
  const visible=await secondDb.prepare('SELECT status FROM reservations WHERE id=?').bind(id).first();
  assert.equal(visible?.status,'connecting',
    'second proxy must see the same persisted database before racing');
  const secondBatch=(currentAuditId)=>secondDb.batch([
    secondDb.prepare("UPDATE reservations SET status='failed' WHERE id=? AND status='connecting'").bind(id),
    secondDb.prepare("INSERT INTO owner_actions (id,reservation_id,action,prior_status,carrier_code,reason,created_at) SELECT ?,?,'force_unlock','connecting',?,?,? WHERE changes()=1").bind(currentAuditId,id,code,reason,now),
    secondDb.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM owner_actions WHERE id=? AND reservation_id=? AND action='force_unlock' AND prior_status='connecting' AND carrier_code=? AND reason=? AND created_at=?)=1 AND changes()=1 AND (SELECT COUNT(*) FROM reservations WHERE id=? AND status='failed')=1 THEN 1 ELSE abs(-9223372036854775807 - 1) END AS recovery_assertion").bind(currentAuditId,id,code,reason,now,id)
  ]);
  const crossProxyRace=await Promise.allSettled([batch('proxy-a'),secondBatch('proxy-b')]);
  assert.equal(crossProxyRace.filter(x=>x.status==='fulfilled').length,1,
    'separate proxy bindings must not both commit owner recovery');
  assert.equal(crossProxyRace.filter(x=>x.status==='rejected').length,1,
    'losing separate proxy recovery must fail closed');
  assert.deepEqual(await state(),{status:'failed',audits:1},
    'cross-proxy recovery must leave exactly one durable audit');
  assert.equal((await secondDb.prepare('SELECT COUNT(*) AS n FROM owner_actions').first()).n,1,
    'second proxy must observe the same single audit');
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
  // Simulate a successful database commit followed by a lost HTTP response.
  // The caller cannot infer failure from a 503/transport error; a retry must
  // fail closed and the durable audit must remain exactly once, including when
  // the retry reaches a separate Worker-like proxy.
  await seed();
  const commitThenLoseResponse=async()=>{
    await batch('response-lost');
    throw new Error('HTTP 503 after successful commit');
  };
  await assert.rejects(commitThenLoseResponse(),/HTTP 503 after successful commit/);
  const committedBeforeResponseLoss=await state();
  assert.deepEqual(committedBeforeResponseLoss,{status:'failed',audits:1},
    'recovery must be durably committed despite simulated response loss');
  await assert.rejects(secondBatch('response-retry'),
    'a retry after lost response must not create another recovery audit');
  assert.deepEqual(await state(),committedBeforeResponseLoss,
    'retry after an ambiguous response must preserve committed state');
  assert.equal((await secondDb.prepare('SELECT COUNT(*) AS n FROM owner_actions').first()).n,1,
    'independent binding must see exactly one audit after ambiguous response');
  // Real localhost transport loss across two independent local D1 bindings.
  // These are minimal test HTTP adapters around the same audited D1 batch,
  // NOT the production Worker owner-authentication handler.
  const ownerToken='offline-owner-test-token';
  const serve=async (runBatch,dropAfterCommit=false)=>{
    const server=createServer(async(req,res)=>{
      if(req.headers.authorization!=='Bearer '+ownerToken){
        res.writeHead(401).end('UNAUTHORIZED');return;
      }
      if(req.method!=='POST'||req.url!=='/owner/force-unlock'){
        res.writeHead(404).end('NOT_FOUND');return;
      }
      try{
        await runBatch(dropAfterCommit?'http-committed':'http-retry');
        if(dropAfterCommit){req.socket.destroy();return;}
        res.writeHead(200).end('UNLOCKED');
      }catch{
        res.writeHead(409).end('CANNOT_UNLOCK');
      }
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    return server.address().port;
  };
  const send=(port,token=ownerToken)=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path:'/owner/force-unlock',
      method:'POST',headers:{authorization:'Bearer '+token}},res=>{
      let body='';res.setEncoding('utf8');
      res.on('data',chunk=>body+=chunk);
      res.on('end',()=>resolve({status:res.statusCode,body}));
      res.on('error',reject);
    });
    req.on('error',reject);
    req.end();
  });
  const firstPort=await serve(batch,true);
  const retryPort=await serve(secondBatch);
  await seed();
  await assert.rejects(send(firstPort),err=>err.code==='ECONNRESET',
    'first socket must be destroyed after successful D1 commit');
  assert.deepEqual(await state(),{status:'failed',audits:1},
    'lost HTTP response must not undo the committed D1 transition');
  assert.deepEqual(await send(retryPort),{status:409,body:'CANNOT_UNLOCK'},
    'second HTTP instance must reject the replay');
  assert.deepEqual(await send(retryPort,'agent-token'),{status:401,body:'UNAUTHORIZED'},
    'agent credentials must not authorize the retry adapter');
  assert.deepEqual(await state(),{status:'failed',audits:1},
    'both HTTP retries must preserve exactly one audit');
  assert.equal((await secondDb.prepare('SELECT id FROM owner_actions').first()).id,
    'http-committed','second D1 binding must see original HTTP commit audit');
  // Pre-commit failure control: an aborting audit trigger must leave no unlock.
  await seed();
  await db.exec("CREATE TRIGGER http_abort_audit BEFORE INSERT ON owner_actions BEGIN SELECT RAISE(ABORT, 'audit rejected'); END;");
  assert.deepEqual(await send(firstPort),{status:409,body:'CANNOT_UNLOCK'});
  assert.deepEqual(await state(),{status:'connecting',audits:0},
    'pre-commit audit failure must roll back the state change');
  await db.exec('DROP TRIGGER http_abort_audit;');
  assert.deepEqual(await send(retryPort),{status:200,body:'UNLOCKED'},
    'retry after a pre-commit failure can recover exactly once');
  assert.deepEqual(await state(),{status:'failed',audits:1});
  const originalAudit=await secondDb.prepare('SELECT id FROM owner_actions WHERE reservation_id=?').bind(id).first();
  assert.equal(originalAudit?.id,'http-retry',
    'successful retry after a rolled-back pre-commit failure must create its own audit');
  // Concurrent authenticated HTTP requests against distinct D1 bindings must
  // have a single winner. The first adapter deliberately loses its response
  // only if its transaction commits; the second adapter returns HTTP 200.
  // Either may win, so assert the invariant rather than request ordering.
  await seed();
  const competing=await Promise.allSettled([send(firstPort),send(retryPort)]);
  const outcomes=competing.map(result=>{
    if(result.status==='rejected'){
      assert.equal(result.reason?.code,'ECONNRESET',
        'only a post-commit socket drop is an expected transport failure');
      return 'committed-without-response';
    }
    assert.ok([200,409].includes(result.value.status),
      'unexpected HTTP status from racing owner recovery');
    return result.value.status===200?'committed':'rejected';
  });
  assert.equal(outcomes.filter(x=>x.startsWith('committed')).length,1,
    'exactly one concurrent HTTP request may commit');
  assert.equal(outcomes.filter(x=>x==='rejected').length,1,
    'the competing HTTP request must fail closed');
  assert.deepEqual(await state(),{status:'failed',audits:1},
    'HTTP race across two D1 bindings must persist exactly one transition and audit');
  assert.equal((await secondDb.prepare('SELECT COUNT(*) AS n FROM owner_actions').first()).n,1,
    'both bindings must agree on the single durable audit after the HTTP race');
  // The durable audit must identify the actual winner, not merely have count 1.
  // A stale or duplicate audit with a different request ID would make a
  // superficially passing count assertion insufficient for incident review.
  const winner=outcomes[0].startsWith('committed')?'http-committed':'http-retry';
  const persistedAudit=await secondDb.prepare('SELECT id,action,prior_status FROM owner_actions WHERE reservation_id=?').bind(id).first();
  assert.deepEqual({...persistedAudit},{id:winner,action:'force_unlock',prior_status:'connecting'},
    'durable audit must correspond to the winning HTTP request');
  // Unauthorized requests interleaved with a valid recovery must never win
  // or create an extra audit. This is adapter-level authorization coverage,
  // not a substitute for the production owner-token verification handler.
  await seed();
  const mixed=await Promise.allSettled([send(firstPort,'agent-token'),send(retryPort)]);
  assert.deepEqual(mixed.map(x=>x.status==='fulfilled'?x.value:{error:x.reason?.code}),[
    {status:401,body:'UNAUTHORIZED'},
    {status:200,body:'UNLOCKED'}
  ],'unauthorized concurrent request must be rejected while owner recovery succeeds');
  assert.deepEqual(await state(),{status:'failed',audits:1},
    'unauthorized concurrent request must not create a second recovery audit');
  assert.equal((await secondDb.prepare('SELECT id FROM owner_actions').first()).id,'http-retry',
    'only the authorized owner recovery may be audited');
});
