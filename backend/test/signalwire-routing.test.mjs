/** Phase 5: SignalWire connect only when both owner flags are on and every gate passes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {signalWireHangup} from '../src/signalwire.mjs';
import {routingSetup,api,owner,approveReservation,swml,call,T0,DEST,INTL,DID,CALLER,PIN_URL,SWML_URL,PROJECT} from './helpers/routing-env.mjs';

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
  const {env,DB}=await routingSetup(t,{CALLER_PROOF_MODE:'dtmf_pin',TEST_DESTINATION_E164:DEST});
  const b=await reserve(env,'flags-off-0001');
  await approveReservation(env,b.id);
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

test('US pilot refuses spoofable caller-ID mode even when owner explicitly accepts risk',async t=>{
  for(const opts of [
    {CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:CALLER},
    {CALLER_PROOF_MODE:'capped_caller_id',TEST_CALLER_E164:CALLER},
    {CALLER_PROOF_MODE:undefined}
  ]){
    const {env,DB}=await routingSetup(t,{...FLAGS,...opts});
    const res=await worker.fetch(api('/v1/reservations','POST',
      {destination:DEST,idempotency_key:'no-insecure-caller-proof'}),env);
    assert.equal(res.status,409,JSON.stringify(opts));
    assert.match((await res.json()).error.message,/DTMF_PROOF_REQUIRED/);
    const r=await inbound(env,{call_id:CID(1)});
    assert.ok(isHangup(r.doc),'caller-ID alone cannot connect a US trial leg');
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
  }
});

test('DTMF PIN mode: prompt, then connect only for the right single-use PIN on the signed PIN URL',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const b=await reserve(env,'pin-flow-0001');
  await approveReservation(env,b.id);
  const first=await inbound(env,{call_id:CID(10),from_number:'+13125550199'});
  const main=first.doc.sections.main;
  assert.deepEqual(main[0],{answer:{max_duration:120}});
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
  assert.deepEqual(connectOf(good.doc),{to:DEST,from:DID,answer_on_bridge:true,timeout:30,max_duration:60});
  await inbound(env,{call_id:CID(12)});
  assert.ok(isHangup((await pin(env,CID(12),b.dtmf_pin)).doc),'single use');
  assert.equal(DB.raw.prepare('SELECT pin_attempts FROM reservations WHERE id=?').get(b.id).pin_attempts,2);
});

test('DTMF follow-up cannot switch to a later reservation after first one is cancelled',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const first=await reserve(env,'pin-binding-A');
  await approveReservation(env,first.id);
  const a=await inbound(env,{call_id:CID(101)});
  assert.ok(a.doc.sections.main.some(x=>x.prompt),'first call requests a PIN');
  const event=DB.raw.prepare("SELECT reservation_id FROM provider_events WHERE provider_call_id=? AND event_type='swml_inbound'")
    .get(CID(101));
  assert.equal(event.reservation_id,first.id,'event pins the original reservation');
  const cancelled=await worker.fetch(api('/v1/reservations/'+first.id+'/cancel','POST'),env);
  assert.equal(cancelled.status,200);
  const second=await reserve(env,'pin-binding-B');
  await approveReservation(env,second.id);
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
  await approveReservation(env,b.id);
  const wrong=b.dtmf_pin==='00000000'?'11111111':'00000000';
  for(let i=0;i<3;i++){await inbound(env,{call_id:CID(20+i)});await pin(env,CID(20+i),wrong);}
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(b.id).status,'failed');
  await inbound(env,{call_id:CID(30)});
  assert.ok(isHangup((await pin(env,CID(30),b.dtmf_pin)).doc));
  const c=await reserve(env,'pin-expiry-001');
  await approveReservation(env,c.id);
  await inbound(env,{call_id:CID(31)});
  at(T0+240);
  assert.ok(isHangup((await pin(env,CID(31),c.dtmf_pin)).doc),'expired between prompt and PIN');
});

test('every signed routing gate fails closed, and a valid signed PIN succeeds',async t=>{
  const extra={...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'};
  const cases={
    'mode none':{CALLER_PROOF_MODE:undefined},
    'destination removed from allowlist':{ROUTING_DESTINATIONS:JSON.stringify([{e164:INTL,country:'NL',rate_cents_per_min:10,rate_source:'x'}])},
    'country not allowed':{ROUTING_ALLOWED_COUNTRIES:'NL'},
    'caps missing':{ROUTING_MAX_SPEND_CENTS_PER_DAY:undefined},
    'per-call spend cap':{ROUTING_MAX_SPEND_CENTS_PER_CALL:'1'},
    'daily spend cap':{ROUTING_MAX_SPEND_CENTS_PER_DAY:'1'},
    'US destination unverified':{US_PILOT_DESTINATION_VERIFIED:undefined}
  };
  let i=40;
  for(const [name,over] of Object.entries(cases)){
    const {env}=await routingSetup(t,{...extra});
    const b=await reserve(env,'gate-'+name.split(' ').join('-').slice(0,20)+'-x');
    await approveReservation(env,b.id);
    const modified={...env,...over};
    for(const [key,value] of Object.entries(modified))if(value===undefined)delete modified[key];
    const r=await inbound(modified,{call_id:CID(i++)});
    assert.ok(r.status!==200||isHangup(r.doc),name);
  }
  const {env}=await routingSetup(t,{...extra});
  const b=await reserve(env,'gate-base-0001');
  await approveReservation(env,b.id);
  assert.equal((await inbound(env,{call_id:CID(50)},{sign:false})).status,403,'unsigned');
  assert.equal((await inbound(env,{call_id:CID(51)},{key:'another-signing-key-xxxxxxxxxxxx'})).status,403,'wrong key');
  assert.equal((await inbound(env,{call_id:CID(52),project_id:'11111111-1111-4111-8111-111111111111'})).status,403);
  assert.equal((await inbound(env,{call_id:CID(53),to_number:'+12025550199'})).status,403);
  assert.equal((await inbound(env,{call_id:CID(54),direction:'outbound'})).status,403);
  assert.equal((await inbound(env,{call_id:'not-a-uuid'})).status,403);
  assert.equal((await inbound({...env,SIGNALWIRE_SIGNING_KEY:undefined},{call_id:CID(55)})).status,503);
  const prompt=await inbound(env,{call_id:CID(56)});
  assert.ok(prompt.doc.sections.main.some(item=>item.prompt),'successful US pilot still requires PIN prompt');
  const checked=await pin(env,CID(56),b.dtmf_pin);
  assert.equal(connectOf(checked.doc)?.to,DEST,'signed PIN allows exact reviewed US destination');
});

test('daily call cap counts claimed calls across reservations',async t=>{
  const {env}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin',ROUTING_MAX_CALLS_PER_DAY:'1'});
  const a=await reserve(env,'daily-cap-0001');await approveReservation(env,a.id);
  await inbound(env,{call_id:CID(60)});
  assert.ok(connectOf((await pin(env,CID(60),a.dtmf_pin)).doc));
  assert.equal((await worker.fetch(owner(a.id,'mark-ended'),env)).status,409);
  // For daily-cap regression, simulate a *separately verified* finished call.
  env.DB.raw.prepare("UPDATE reservations SET status='completed' WHERE id=? AND status='connecting'").run(a.id);
  const b=await reserve(env,'daily-cap-0002');await approveReservation(env,b.id);
  assert.ok(isHangup((await inbound(env,{call_id:CID(61)})).doc),'daily cap applies before prompt');
});
