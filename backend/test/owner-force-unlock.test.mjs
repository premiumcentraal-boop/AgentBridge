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
  t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  for(const body of [{},{force:false,reason:'call ended in dashboard'},{force:true},{force:true,reason:'short'},
    {force:true,reason:'bad\u0000control chars here'}]){
    const r=await worker.fetch(unlock(id,body),env);
    assert.equal(r.status,409,JSON.stringify(body));
    const e=(await r.json()).error;
    assert.equal(e.code,'FORCE_REQUIRED');
    assert.match(e.message,/INCOMPLETE_CARRIER_LOGS/);
  }
  for(const body of [{force:'yes',reason:'call ended in dashboard'},{force:true,reason:'x'.repeat(10),extra:1}])
    assert.equal((await worker.fetch(unlock(id,body),env)).status,422);
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

test('force-unlock tries carrier reconciliation first and completes normally when it succeeds',async t=>{
  const {env,DB,id}=await stuck(t);
  const inbound={id:SEG,parent_id:null,direction:'inbound',status:'completed',to:DID,charge:0.01};
  const child={id:CHILD,parent_id:SEG,direction:'outbound',status:'completed',from:DID,to:DEST,charge:0.02};
  const seen=[];
  t.mock.method(globalThis,'fetch',async(url,o)=>{
    seen.push(o.method);
    return new Response(JSON.stringify(String(url).endsWith('/'+SEG)?inbound:{data:[child],links:{self:'s',first:'f'}}));
  });
  const r=await worker.fetch(unlock(id,{}),env);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.status,'completed');
  assert.equal(body.carrier_confirmed,true);
  assert.equal(body.actual_cost_cents,3);
  assert.deepEqual([...new Set(seen)],['GET'],'reconciliation is read-only');
  assert.equal(status(DB,id),'completed');
  assert.equal(DB.raw.prepare('SELECT actual_cost_cents FROM reservation_carrier_legs WHERE reservation_id=?').get(id).actual_cost_cents,3);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions').get().n,0);
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
