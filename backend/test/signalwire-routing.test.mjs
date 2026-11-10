/** Phase 5: SignalWire connect only when both owner flags are on and every gate passes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {signalWireHangup} from '../src/signalwire.mjs';
import {routingSetup,api,owner,swml,call,T0,DEST,INTL,DID,CALLER,PIN_URL,SWML_URL,PROJECT} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const CID=n=>'38313c74-b321-4c08-a3ea-'+String(n).padStart(12,'0');
const isHangup=doc=>JSON.stringify(doc)===JSON.stringify(signalWireHangup());
async function reserve(env,key,dest=DEST){
  const r=await worker.fetch(api('/v1/reservations','POST',{destination:dest,idempotency_key:key}),env);
  assert.equal(r.status,201,key);return r.json();
}
async function inbound(env,over={},opts){const r=await worker.fetch(swml({call:call(over)},SWML_URL,opts),env);return {status:r.status,doc:r.status===200?await r.json():null};}
async function pin(env,callId,digits,signUrl=PIN_URL){
  const r=await worker.fetch(swml({call:call({call_id:callId}),params:{digits},vars:{prompt_value:digits}},PIN_URL,{signUrl}),env);
  return {status:r.status,doc:r.status===200?await r.json():null};
}
const connectOf=doc=>doc?.sections?.main?.find(s=>s.connect)?.connect;

test('flags off (any combination short of both exactly "true"): hangup-only and D1 untouched',async t=>{
  const {env,DB}=await routingSetup(t,{CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:CALLER,
    TEST_DESTINATION_E164:DEST});
  const b=await reserve(env,'flags-off-0001');
  await worker.fetch(owner(b.id),env);
  const before=DB.log.length;
  for(const flags of [{},{PRIVATE_TEST_OUTBOUND_ENABLED:'true'},{SIGNALWIRE_CONNECT_ENABLED:'true'},
    {PRIVATE_TEST_OUTBOUND_ENABLED:'TRUE',SIGNALWIRE_CONNECT_ENABLED:'true'},{PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'1'}]){
    const e={...env,...flags};
    const r=await inbound(e);
    assert.equal(r.status,200);assert.ok(isHangup(r.doc),JSON.stringify(flags));
    const p=await worker.fetch(swml({call:call(),params:{digits:'12345678'}},PIN_URL),e);
    assert.notEqual(p.status,200,'PIN endpoint does not exist while flags are off');
  }
  assert.equal(DB.log.length,before,'legacy path never touches D1');
});

test('capped caller-ID mode: connect only for the owner-accepted caller, with tight caps, exactly once',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:CALLER});
  const b=await reserve(env,'capped-0001');
  assert.ok(isHangup((await inbound(env,{call_id:CID(1)})).doc),'not yet approved');
  assert.equal((await worker.fetch(owner(b.id),env)).status,200);
  assert.ok(isHangup((await inbound(env,{call_id:CID(2),from_number:'+12125550178'})).doc),'wrong caller');
  const ok=await inbound(env,{call_id:CID(3)});
  const c=connectOf(ok.doc);
  assert.deepEqual(c,{to:DEST,from:DID,answer_on_bridge:true,timeout:30,max_duration:120});
  assert.ok(!/"(ai|record|record_call|transcribe|stream|play|say)"/.test(JSON.stringify(ok.doc)));
  assert.ok(isHangup((await inbound(env,{call_id:CID(3)})).doc),'replay of the same call_id');
  assert.ok(isHangup((await inbound(env,{call_id:CID(4)})).doc),'reservation already consumed');
  const row=DB.raw.prepare('SELECT status,provider,provider_call_id,max_call_seconds,max_cost_cents FROM reservations WHERE id=?').get(b.id);
  assert.deepEqual({...row},{status:'connecting',provider:'signalwire',provider_call_id:CID(3),max_call_seconds:120,max_cost_cents:4});
  const ev=DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=?").get(CID(3));
  assert.equal(ev.outcome,'connect');
  assert.ok(!JSON.stringify(DB.raw.prepare('SELECT * FROM provider_events').all()).includes(CALLER),'ledger stores no numbers');
  assert.equal((await worker.fetch(owner(b.id,'mark-ended'),env)).status,200);
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(b.id).status,'completed');
});

test('caller-ID mode without explicit owner acceptance never routes',async t=>{
  const {env}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'capped_caller_id',TEST_CALLER_E164:CALLER});
  const b=await reserve(env,'capped-noacc-1');
  await worker.fetch(owner(b.id),env);
  assert.ok(isHangup((await inbound(env)).doc));
});

test('DTMF PIN mode: prompt, then connect only for the right single-use PIN on the signed PIN URL',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const b=await reserve(env,'pin-flow-0001');
  await worker.fetch(owner(b.id),env);
  const first=await inbound(env,{call_id:CID(10),from_number:'+13125550199'});
  const main=first.doc.sections.main;
  assert.deepEqual(main[0],{answer:{max_duration:240}});
  assert.deepEqual(main[1].prompt,{play:'silence:1',max_digits:8,terminators:'#',digit_timeout:5,initial_timeout:15});
  assert.deepEqual(main[2].transfer,{dest:PIN_URL,params:{digits:'${prompt_value}'}});
  assert.ok(!JSON.stringify(first.doc).includes(b.dtmf_pin),'PIN never echoed');
  // a body signed for the main URL is refused on the PIN URL; unknown calls hang up
  assert.equal((await pin(env,CID(10),b.dtmf_pin,SWML_URL)).status,403);
  assert.ok(isHangup((await pin(env,CID(99),b.dtmf_pin)).doc),'no prior inbound event for that call');
  const wrong=b.dtmf_pin==='00000000'?'11111111':'00000000';
  assert.ok(isHangup((await pin(env,CID(10),wrong)).doc));
  assert.ok(isHangup((await pin(env,CID(10),b.dtmf_pin)).doc),'one PIN submission per call (replay)');
  await inbound(env,{call_id:CID(11)});
  const good=await pin(env,CID(11),b.dtmf_pin+'#');
  assert.deepEqual(connectOf(good.doc),{to:DEST,from:DID,answer_on_bridge:true,timeout:30,max_duration:180});
  await inbound(env,{call_id:CID(12)});
  assert.ok(isHangup((await pin(env,CID(12),b.dtmf_pin)).doc),'single use');
  assert.equal(DB.raw.prepare('SELECT pin_attempts FROM reservations WHERE id=?').get(b.id).pin_attempts,2);
});

test('DTMF follow-up cannot switch to a later reservation after first one is cancelled',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const first=await reserve(env,'pin-binding-A');
  await worker.fetch(owner(first.id),env);
  const a=await inbound(env,{call_id:CID(101)});
  assert.ok(a.doc.sections.main.some(x=>x.prompt),'first call requests a PIN');
  const event=DB.raw.prepare("SELECT reservation_id FROM provider_events WHERE provider_call_id=? AND event_type='swml_inbound'")
    .get(CID(101));
  assert.equal(event.reservation_id,first.id,'event pins the original reservation');
  const cancelled=await worker.fetch(api('/v1/reservations/'+first.id+'/cancel','POST'),env);
  assert.equal(cancelled.status,200);
  const second=await reserve(env,'pin-binding-B');
  await worker.fetch(owner(second.id),env);
  const wrongCall=await pin(env,CID(101),second.dtmf_pin);
  assert.ok(isHangup(wrongCall.doc),'old call must not claim new approved reservation');
  assert.deepEqual({...DB.raw.prepare('SELECT status,pin_attempts FROM reservations WHERE id=?').get(second.id)},
    {status:'ready',pin_attempts:0},'later reservation is unconsumed');
  await inbound(env,{call_id:CID(102)});
  const right=await pin(env,CID(102),second.dtmf_pin);
  assert.equal(connectOf(right.doc)?.to,DEST,'new call can claim its own reservation');
});

test('DTMF PIN: attempt limit burns the reservation; expiry ends it',async t=>{
  const {env,DB,at}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const b=await reserve(env,'pin-limit-0001');
  await worker.fetch(owner(b.id),env);
  const wrong=b.dtmf_pin==='00000000'?'11111111':'00000000';
  for(let i=0;i<3;i++){await inbound(env,{call_id:CID(20+i)});await pin(env,CID(20+i),wrong);}
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(b.id).status,'failed');
  await inbound(env,{call_id:CID(30)});
  assert.ok(isHangup((await pin(env,CID(30),b.dtmf_pin)).doc));
  const c=await reserve(env,'pin-expiry-001');
  await worker.fetch(owner(c.id),env);
  await inbound(env,{call_id:CID(31)});
  at(T0+240);
  assert.ok(isHangup((await pin(env,CID(31),c.dtmf_pin)).doc),'expired between prompt and PIN');
});

test('every gate on its own forces hangup (capped mode baseline that would otherwise connect)',async t=>{
  const extra={...FLAGS,CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:CALLER};
  const cases={
    'mode none':{CALLER_PROOF_MODE:undefined},
    'destination removed from allowlist':{ROUTING_DESTINATIONS:JSON.stringify([{e164:INTL,country:'NL',rate_cents_per_min:10,rate_source:'x'}])},
    'country not allowed':{ROUTING_ALLOWED_COUNTRIES:'NL'},
    'caps missing':{ROUTING_MAX_SPEND_CENTS_PER_DAY:undefined},
    'per-call spend cap':{ROUTING_MAX_SPEND_CENTS_PER_CALL:'3'},
    'daily spend cap':{ROUTING_MAX_SPEND_CENTS_PER_DAY:'3'},
  };
  for(const [name,over] of Object.entries(cases)){
    const {env}=await routingSetup(t,{...extra});
    const b=await reserve(env,'gate-'+name.replace(/\W/g,'-').slice(0,20)+'-x');
    await worker.fetch(owner(b.id),env);
    const e={...env,...over};for(const [k,v] of Object.entries(e))if(v===undefined)delete e[k];
    const r=await inbound(e,{call_id:CID(40)});
    assert.ok(r.status!==200||isHangup(r.doc),name);
  }
  const {env}=await routingSetup(t,{...extra});
  const b=await reserve(env,'gate-base-0001');
  await worker.fetch(owner(b.id),env);
  assert.equal((await inbound(env,{call_id:CID(50)},{sign:false})).status,403,'unsigned');
  assert.equal((await inbound(env,{call_id:CID(51)},{key:'another-signing-key-xxxxxxxxxxxx'})).status,403,'wrong key');
  assert.equal((await inbound(env,{call_id:CID(52),project_id:'11111111-1111-4111-8111-111111111111'})).status,403);
  assert.equal((await inbound(env,{call_id:CID(53),to_number:'+12025550199'})).status,403);
  assert.equal((await inbound(env,{call_id:CID(54),direction:'outbound'})).status,403);
  assert.equal((await inbound(env,{call_id:'not-a-uuid'})).status,403);
  assert.equal((await inbound({...env,SIGNALWIRE_SIGNING_KEY:undefined},{call_id:CID(55)})).status,503);
  assert.deepEqual(connectOf((await inbound(env,{call_id:CID(56)})).doc).to,DEST,'baseline connects');
});

test('daily call cap counts claimed calls across reservations',async t=>{
  const {env}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:CALLER,
    ROUTING_MAX_CALLS_PER_DAY:'1'});
  const a=await reserve(env,'daily-cap-0001');await worker.fetch(owner(a.id),env);
  assert.ok(connectOf((await inbound(env,{call_id:CID(60)})).doc));
  await worker.fetch(owner(a.id,'mark-ended'),env);
  const b=await reserve(env,'daily-cap-0002');await worker.fetch(owner(b.id),env);
  assert.ok(isHangup((await inbound(env,{call_id:CID(61)})).doc));
});
