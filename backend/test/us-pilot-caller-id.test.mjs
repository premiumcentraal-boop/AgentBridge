import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,owner,approveReservation,swml,call,BASE,OWNER,TOKEN,DEST,CALLER} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const OPT_IN={CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',
  US_PILOT_ALLOW_CALLER_ID_PROOF:'true',TEST_CALLER_E164:CALLER,
  ROUTING_MAX_CALL_SECONDS:'600',ROUTING_MAX_CALLS_PER_DAY:'4',
  ROUTING_MAX_SPEND_CENTS_PER_CALL:'50',ROUTING_MAX_SPEND_CENTS_PER_DAY:'100'};
const CID=n=>'3'+String(n).padStart(7,'0')+'-b321-4c08-a3ea-7123449130ab';
const reserve=(env,key)=>worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:key}),env);
async function inbound(env,over){
  const r=await worker.fetch(swml({call:call(over)}),env);
  return {status:r.status,doc:r.status===200?await r.json():null};
}
const connectOf=doc=>doc?.sections?.main?.find(s=>s.connect)?.connect;
const isHangup=doc=>Array.isArray(doc?.sections?.main)&&doc.sections.main.length===1&&'hangup' in doc.sections.main[0];

test('caller-ID pilot needs BOTH owner opt-ins; otherwise DTMF stays mandatory',async t=>{
  for(const missing of ['US_PILOT_ALLOW_CALLER_ID_PROOF','CALLER_ID_TRUST_ACCEPTED']){
    const {env}=await routingSetup(t,{...FLAGS,...OPT_IN,[missing]:undefined});
    const res=await reserve(env,'cid-missing-'+missing.length);
    assert.equal(res.status,409,missing);
    assert.match((await res.json()).error.message,/DTMF_PROOF_REQUIRED/);
  }
  const {env}=await routingSetup(t,{...FLAGS,...OPT_IN,US_PILOT_ALLOW_CALLER_ID_PROOF:'TRUE'});
  assert.equal((await reserve(env,'cid-case-sensitive')).status,409);
});

test('opted-in caller-ID pilot: 10-minute capped connect only for the exact approved caller',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...OPT_IN});
  const created=await (await reserve(env,'cid-flow-0001')).json();
  assert.equal(created.caller_proof,'capped_caller_id');
  assert.equal(created.dtmf_pin,undefined,'no PIN in caller-ID mode');
  assert.equal(created.max_call_seconds,600);
  // 10 started outbound minutes at 2c + (10+3) inbound minutes at 1c.
  assert.equal(created.estimate.max_cost_cents,33);
  const review=await (await worker.fetch(owner(created.id,'review'),env)).json();
  assert.equal(review.proposal.trusted_caller,CALLER);
  assert.equal(review.proposal.caller_id_spoofable,true);
  assert.equal(review.proposal.max_call_seconds,600);
  assert.equal((await approveReservation(env,created.id)).status,200);
  // Wrong caller: free hangup, reservation untouched, attempt logged.
  const spoofless=await inbound(env,{call_id:CID(1),from_number:'+13125550199'});
  assert.ok(isHangup(spoofless.doc));
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(created.id).status,'ready');
  // Exact caller: connect to the one destination with max_duration 600.
  const ok=await inbound(env,{call_id:CID(2)});
  const c=connectOf(ok.doc);
  assert.equal(c?.to,DEST);
  assert.equal(c.max_duration,600);
  assert.equal(c.timeout,30);
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(created.id).status,'connecting');
  // Replay of the same call id cannot connect again.
  assert.ok(isHangup((await inbound(env,{call_id:CID(2)})).doc));
  const log=DB.raw.prepare('SELECT from_number,caller_matches_test_caller FROM inbound_call_log ORDER BY id').all();
  assert.deepEqual(log.map(x=>[x.from_number,x.caller_matches_test_caller]),[['+13125550199',0],[CALLER,1]]);
});

test('changing the trusted caller after approval invalidates the approval fingerprint',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...OPT_IN});
  const created=await (await reserve(env,'cid-flow-0002')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  const other='+13125550100';
  const changed={...env,TEST_CALLER_E164:other};
  const r=await inbound(changed,{call_id:CID(3),from_number:other});
  assert.ok(isHangup(r.doc),'approval was for a different caller');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(created.id).status,'ready');
});

test('caller-ID pilot still enforces caps: more than 100c/day or 4 calls/day is refused',async t=>{
  for(const [k,v] of [['ROUTING_MAX_CALLS_PER_DAY','5'],['ROUTING_MAX_SPEND_CENTS_PER_DAY','101'],['ROUTING_MAX_CALL_SECONDS','601']]){
    const {env}=await routingSetup(t,{...FLAGS,...OPT_IN,[k]:v});
    assert.equal((await reserve(env,'cid-cap-'+k.length)).status,409,k);
  }
});

test('owner-only inbound call log endpoint',async t=>{
  const {env}=await routingSetup(t,{...OPT_IN});
  await inbound(env,{call_id:CID(4),from_number:'+14155550123'});
  const get=tok=>worker.fetch(new Request(BASE+'/v1/owner/inbound-calls?limit=5',{headers:{authorization:'Bearer '+tok}}),env);
  assert.equal((await get(TOKEN)).status,401,'agent token cannot read caller IDs');
  const r=await get(OWNER);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.calls.length,1);
  assert.equal(body.calls[0].from_number,'+14155550123');
  assert.equal(body.calls[0].handler,'swml_hangup_only');
  assert.match(body.calls[0].received_at_iso,/^\d{4}-\d\d-\d\dT/);
  assert.equal((await worker.fetch(new Request(BASE+'/v1/owner/inbound-calls',{method:'POST',headers:{authorization:'Bearer '+OWNER}}),env)).status,405);
});
