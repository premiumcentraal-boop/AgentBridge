import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,approveReservation,BASE,OWNER,TOKEN,DEST,DID,T0} from './helpers/routing-env.mjs';

const SEG='48313c74-b321-4c08-a3ea-7123449130ab';
const CALL='38313c74-b321-4c08-a3ea-7123449130ab';
const CHILD='58313c74-b321-4c08-a3ea-7123449130ab';
const VOICE={SIGNALWIRE_SPACE:'example-space',SIGNALWIRE_VOICE_API_TOKEN:'voice-logs-read-token-for-tests'};
const unlock=(id,body,token=OWNER)=>new Request(BASE+'/v1/owner/reservations/'+id+'/force-unlock',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify(body??{})});
async function stuck(t,extra={}){
  const s=await routingSetup(t,{...VOICE,...extra});
  const created=await (await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'stuck-0001'}),s.env)).json();
  assert.equal((await approveReservation(s.env,created.id)).status,200);
  s.DB.raw.prepare("UPDATE reservations SET status='connecting',provider='signalwire',provider_call_id=?,claimed_at=?,max_cost_cents=6 WHERE id=?").run(CALL,T0,created.id);
  s.DB.raw.prepare('INSERT INTO reservation_carrier_legs (reservation_id,provider_segment_id,claimed_at) VALUES (?,?,?)').run(created.id,SEG,T0);
  return {...s,id:created.id};
}
const status=(DB,id)=>DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(id).status;

test('force-unlock requires the owner token, never the agent bearer token',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('nope',{status:503}));
  assert.equal((await worker.fetch(unlock(id,{force:true,reason:'agent tries'},TOKEN),env)).status,401);
  assert.equal((await worker.fetch(new Request(BASE+'/v1/owner/reservations/'+id+'/force-unlock',{method:'GET',headers:{authorization:'Bearer '+OWNER}}),env)).status,405);
  assert.equal(status(DB,id),'connecting');
});

test('without force + reason a failed reconciliation keeps the lock and reports the carrier code',async t=>{
  const {env,DB,id}=await stuck(t);
  let carrierReads=0;
  t.mock.method(globalThis,'fetch',async()=>{carrierReads++;return new Response('unavailable',{status:503});});
  for(const body of [{},{force:false,reason:'call ended in dashboard'},{force:true},{force:true,reason:'short'},
    {force:true,reason:'bad\u0000control chars here'}]){
    const r=await worker.fetch(unlock(id,body),env);
    assert.equal(r.status,409,JSON.stringify(body));
    const e=(await r.json()).error;
    assert.equal(e.code,'FORCE_REQUIRED');
    assert.match(e.message,/SignalWire dashboard/);
  }
  for(const body of [{force:'yes',reason:'call ended in dashboard'},{force:true,reason:'x'.repeat(10),extra:1}])
    assert.equal((await worker.fetch(unlock(id,body),env)).status,422);
  assert.equal(carrierReads,0,'invalid force requests must not trigger carrier API reads');
  assert.equal(status(DB,id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions').get().n,0);
  // A new reservation is still refused while the stuck one holds the lock.
  const busy=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'stuck-0002'}),env);
  assert.equal(busy.status,409);
});

test('explicit forced unlock is audited, releases the lock and still counts toward the daily cap',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  const r=await worker.fetch(unlock(id,{force:true,reason:'  Call ended per SignalWire dashboard  '}),env);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.status,'failed');
  assert.equal(body.force_unlocked,true);
  assert.equal(body.carrier_code,'INCOMPLETE_CARRIER_LOGS');
  assert.equal(status(DB,id),'failed');
  const audit=DB.raw.prepare('SELECT * FROM owner_actions WHERE reservation_id=?').all(id);
  assert.equal(audit.length,1);
  assert.equal(audit[0].action,'force_unlock');
  assert.equal(audit[0].reason,'Call ended per SignalWire dashboard');
  assert.equal(audit[0].carrier_code,'INCOMPLETE_CARRIER_LOGS');
  assert.ok(!JSON.stringify(audit).includes(DEST)&&!JSON.stringify(audit).includes(DID),'no phone numbers in audit');
  // Second unlock: nothing is connecting any more.
  assert.equal((await worker.fetch(unlock(id,{force:true,reason:'again please'}),env)).status,409);
  // Lock released: a new reservation can be prepared ...
  const next=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'stuck-0003'}),env);
  assert.equal(next.status,201);
  // ... but the forced call still counts as claimed today (1/day cap).
  const usage=DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations WHERE claimed_at>=?').get(T0-86400).n;
  assert.equal(usage,1);
});

test('complete-looking carrier snapshot cannot silently release a reservation',async t=>{
  const {env,DB,id}=await stuck(t);
  const inbound={id:SEG,parent_id:null,direction:'inbound',status:'completed',to:DID,charge:0.01};
  const child={id:CHILD,parent_id:SEG,direction:'outbound',status:'completed',from:DID,to:DEST,charge:0.02};
  const seen=[];
  t.mock.method(globalThis,'fetch',async(url,o)=>{
    seen.push(o.method);
    return new Response(JSON.stringify(String(url).endsWith('/'+SEG)?inbound:{data:[inbound,child],links:{self:String(url),first:String(url)}}));
  });
  const mark=await worker.fetch(new Request(BASE+'/v1/owner/reservations/'+id+'/mark-ended',{
    method:'POST',headers:{authorization:'Bearer '+OWNER}}),env);
  assert.equal(mark.status,409);
  assert.equal((await mark.json()).error.code,'CARRIER_FINALITY_UNVERIFIED');
  const attempt=await worker.fetch(unlock(id,{}),env);
  assert.equal(attempt.status,409);
  assert.equal((await attempt.json()).error.code,'FORCE_REQUIRED');
  assert.equal(seen.length,2,'invalid force attempt does not fetch the carrier again');
  assert.equal(status(DB,id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions').get().n,0);
  assert.equal(DB.raw.prepare('SELECT actual_cost_cents FROM reservation_carrier_legs WHERE reservation_id=?').get(id).actual_cost_cents,null);
  const manual=await worker.fetch(unlock(id,{force:true,reason:'Verified terminal in dashboard and reviewed billing'}),env);
  assert.equal(manual.status,200);
  const body=await manual.json();
  assert.equal(body.status,'failed');
  assert.equal(body.force_unlocked,true);
  assert.equal(body.carrier_code,'CARRIER_FINALITY_UNVERIFIED');
  assert.equal(status(DB,id),'failed');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions').get().n,1);
  assert.deepEqual([...new Set(seen)],['GET'],'carrier lookups remain read-only');
});

test('force-unlock fails closed (no unlock) when the audit table is missing',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  DB.raw.exec('DROP TABLE owner_actions');
  const r=await worker.fetch(unlock(id,{force:true,reason:'Call ended per dashboard'}),env);
  assert.equal(r.status,503);
  assert.equal(status(DB,id),'connecting','batch rolled back: audit is mandatory');
});

test('mark-ended points the owner at force-unlock when carrier proof is unavailable',async t=>{
  const {env,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  const r=await worker.fetch(new Request(BASE+'/v1/owner/reservations/'+id+'/mark-ended',{method:'POST',headers:{authorization:'Bearer '+OWNER}}),env);
  assert.equal(r.status,409);
  assert.match((await r.json()).error.message,/force-unlock/);
});

test('stale concurrent recovery cannot leave an orphan force-unlock audit',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  const originalBatch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
    // Simulate another request winning between the owner read and atomic batch.
    DB.raw.prepare("UPDATE reservations SET status='failed' WHERE id=?").run(id);
    return originalBatch(statements);
  };
  const r=await worker.fetch(unlock(id,{force:true,reason:'Confirmed terminated in carrier dashboard'}),env);
  assert.equal(r.status,409);
  assert.equal((await r.json()).error.code,'CANNOT_UNLOCK');
  assert.equal(status(DB,id),'failed');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
});

test('force-unlock refuses nontransactional storage before any recovery writes',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  env.DB.batch=undefined;
  const r=await worker.fetch(unlock(id,{force:true,reason:'Confirmed terminated in carrier dashboard'}),env);
  assert.equal(r.status,503);
  assert.equal(status(DB,id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
});

test('audit insertion failure rolls back the reservation transition atomically',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  // A valid table can still reject inserts (disk/constraint/trigger failures).
  // The reservation must remain connecting if the audit cannot commit.
  DB.raw.exec(`CREATE TRIGGER reject_force_unlock_audit
    BEFORE INSERT ON owner_actions
    BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`);
  const r=await worker.fetch(unlock(id,{force:true,reason:'Carrier dashboard confirms call termination'}),env);
  assert.equal(r.status,503);
  assert.equal((await r.json()).error.code,'AUDIT_STORAGE_UNAVAILABLE');
  assert.equal(status(DB,id),'connecting','failed audit must roll back the state change');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
  const busy=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'audit-failure-busy'}),env);
  assert.equal(busy.status,409,'failed recovery must retain the account lock');
});

test('silently ignored audit INSERT rolls back recovery before lock release',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  // RAISE(IGNORE) skips the insert without throwing. A post-commit
  // meta.changes check cannot undo the preceding reservation transition.
  DB.raw.exec(`CREATE TRIGGER ignore_force_unlock_audit
    BEFORE INSERT ON owner_actions
    BEGIN SELECT RAISE(IGNORE); END`);
  const r=await worker.fetch(unlock(id,{force:true,reason:'Carrier dashboard confirms the call ended'}),env);
  assert.equal(r.status,503);
  assert.equal((await r.json()).error.code,'AUDIT_STORAGE_UNAVAILABLE');
  assert.equal(status(DB,id),'connecting','audit assertion must roll back the unlock');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
  const busy=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'ignored-audit-busy'}),env);
  assert.equal(busy.status,409,'failed audit cannot free the durable reservation lock');
});


test('simultaneous duplicate owner recovery commits exactly one audit and one unlock',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  // Both requests are independently authorized. Only one may consume the
  // connecting state, even if both read it before their transactional batch.
  const originalBatch=env.DB.batch.bind(env.DB);
  let waiting=[];
  env.DB.batch=async statements=>{
    if(waiting){
      const ready=waiting;
      await new Promise(resolve=>{
        ready.push(resolve);
        if(ready.length===2){
          waiting=null;
          for(const release of ready)release();
        }
      });
    }
    return originalBatch(statements);
  };
  const responses=await Promise.all([
    worker.fetch(unlock(id,{force:true,reason:'Dashboard confirmed ended, operator A'}),env),
    worker.fetch(unlock(id,{force:true,reason:'Dashboard confirmed ended, operator B'}),env)
  ]);
  assert.deepEqual(responses.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  const loser=responses.find(r=>r.status===409);
  assert.equal((await loser.json()).error.code,'CANNOT_UNLOCK');
  assert.equal(status(DB,id),'failed');
  const audit=DB.raw.prepare("SELECT action,reason FROM owner_actions WHERE reservation_id=?").all(id);
  assert.equal(audit.length,1,'exactly one durable owner action');
  assert.equal(audit[0].action,'force_unlock');
  assert.match(audit[0].reason,/operator [AB]$/);
});

test('silently ignored reservation UPDATE cannot create an orphan audit or unlock',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  // The row still exists and is connecting, but the UPDATE is silently skipped.
  // The following INSERT must not audit a transition that never happened.
  DB.raw.exec(`CREATE TRIGGER ignore_force_unlock_transition
    BEFORE UPDATE OF status ON reservations
    WHEN NEW.status='failed' AND OLD.status='connecting'
    BEGIN SELECT RAISE(IGNORE); END`);
  const r=await worker.fetch(unlock(id,{force:true,reason:'Carrier dashboard confirmed termination'}),env);
  assert.equal(r.status,503);
  assert.equal((await r.json()).error.code,'AUDIT_STORAGE_UNAVAILABLE');
  assert.equal(status(DB,id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
  assert.equal((await worker.fetch(api('/v1/reservations','POST',{
    destination:DEST,idempotency_key:'ignored-transition-busy'}),env)).status,409);
});

test('missing D1 change metadata never produces a successful owner recovery response',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  const originalBatch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
    const results=await originalBatch(statements);
    // Simulate a storage adapter that committed but did not return trustworthy
    // affected-row metadata. Never claim a verified unlock on this response.
    return results.map(result=>({meta:{}}));
  };
  const r=await worker.fetch(unlock(id,{force:true,reason:'Carrier dashboard confirmed termination'}),env);
  assert.notEqual(r.status,200,'ambiguous storage metadata cannot confirm recovery');
  assert.equal(r.status,503,'missing metadata is storage uncertainty, not a confirmed stale-state conflict');
  assert.equal((await r.json()).error.code,'AUDIT_STORAGE_UNAVAILABLE');
  // This intentionally documents a post-commit ambiguity: the DB may already
  // have committed, so operators must inspect durable state before retrying.
  assert.equal(status(DB,id),'failed');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,1);
});


test('force-unlock rolls back when an AFTER INSERT trigger removes the audit row',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  DB.raw.exec(`CREATE TRIGGER erase_force_unlock_audit AFTER INSERT ON owner_actions
    WHEN NEW.action='force_unlock' BEGIN DELETE FROM owner_actions WHERE id=NEW.id; END`);
  const r=await worker.fetch(unlock(id,{force:true,reason:'Carrier dashboard confirmed call ended'}),env);
  assert.equal(r.status,503);
  assert.equal(status(DB,id),'connecting','missing durable audit must roll back unlock');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
  const busy=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'stuck-after-audit-delete'}),env);
  assert.equal(busy.status,409,'reservation lock must remain held');
});

test('AFTER UPDATE trigger restoring connecting cannot commit an audited false unlock',async t=>{
  const {env,DB,id}=await stuck(t);
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  // SQLite reports changes()=1 for the outer UPDATE even though this trigger
  // reverses its transition. Audit existence alone is not sufficient proof.
  DB.raw.exec(`CREATE TRIGGER revert_force_unlock_transition
    AFTER UPDATE OF status ON reservations
    WHEN NEW.status='failed' AND OLD.status='connecting'
    BEGIN UPDATE reservations SET status='connecting' WHERE id=NEW.id; END`);
  const r=await worker.fetch(unlock(id,{force:true,reason:'Carrier dashboard confirmed call ended'}),env);
  assert.equal(r.status,503);
  assert.equal((await r.json()).error.code,'AUDIT_STORAGE_UNAVAILABLE');
  assert.equal(status(DB,id),'connecting','reverted transition must retain lock');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0,
    'audit and state transition must roll back together');
  const busy=await worker.fetch(api('/v1/reservations','POST',{
    destination:DEST,idempotency_key:'reverted-transition-busy'}),env);
  assert.equal(busy.status,409,'false unlock cannot admit another reservation');
});
