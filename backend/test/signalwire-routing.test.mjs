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
  const {env,DB}=await routingSetup(t,{CALLER_PROOF_MODE:'dtmf_pin',TEST_CALLER_E164:CALLER,TEST_DESTINATION_E164:DEST});
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
  // The hangup-only path only appends to the owner-readable inbound call log.
  assert.ok(DB.log.slice(before).every(sql=>sql.startsWith('INSERT OR IGNORE INTO inbound_call_log')),
    'legacy path never reads or changes reservations');
  const logged=DB.raw.prepare('SELECT handler,from_number,caller_matches_test_caller,outcome FROM inbound_call_log').all();
  assert.equal(logged.length,1,'one row per call id, retries ignored');
  assert.deepEqual({...logged[0]},{handler:'swml_hangup_only',from_number:CALLER,caller_matches_test_caller:1,outcome:'hangup_known_caller'});
  assert.equal(DB.raw.prepare("SELECT status FROM reservations WHERE id=?").get(b.id).status,'ready');
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

test('DTMF challenge freshness is enforced server-side even while reservation is ready',async t=>{
  const {env,DB,at}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const b=await reserve(env,'challenge-window-boundary');
  await approveReservation(env,b.id);
  const id=CID(210);
  await inbound(env,{call_id:id});
  const event=DB.raw.prepare("SELECT received_at FROM provider_events WHERE provider_call_id=? AND event_type='swml_inbound'").get(id);
  assert.equal(event.received_at,T0);
  at(T0+59);
  const within=await pin(env,id,b.dtmf_pin);
  assert.equal(connectOf(within.doc)?.to,DEST,'59-second challenge remains valid');

  // Separate ready reservation: 60-second challenge must fail, despite the
  // reservation itself still being unexpired and the PIN being correct.
  DB.raw.prepare("UPDATE reservations SET status='completed' WHERE id=?").run(b.id);
  at(T0+60);
  const c=await reserve(env,'challenge-exact-sixty');
  await approveReservation(env,c.id);
  const id2=CID(211);
  await inbound(env,{call_id:id2});
  at(T0+120);
  assert.ok(isHangup((await pin(env,id2,c.dtmf_pin)).doc),'exactly 60 seconds expires');
  assert.deepEqual({...DB.raw.prepare('SELECT status,pin_attempts FROM reservations WHERE id=?').get(c.id)},
    {status:'ready',pin_attempts:0},'expired challenge cannot consume or mutate reservation');
});

test('DTMF challenge rejects malformed and future timestamps without burning PIN',async t=>{
  const {env,DB,at}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const b=await reserve(env,'challenge-invalid-time');
  await approveReservation(env,b.id);
  const id=CID(212);
  await inbound(env,{call_id:id});
  const update=DB.raw.prepare("UPDATE provider_events SET received_at=? WHERE provider_call_id=? AND event_type='swml_inbound'");
  for(const value of [T0+1,'invalid',-1]){
    update.run(value,id);
    assert.ok(isHangup((await pin(env,id,b.dtmf_pin)).doc),String(value));
  }
  assert.equal(DB.raw.prepare('SELECT pin_attempts FROM reservations WHERE id=?').get(b.id).pin_attempts,0);
  update.run(T0,id);
  at(T0+1);
  assert.equal(connectOf((await pin(env,id,b.dtmf_pin)).doc)?.to,DEST,'valid original timestamp works');
});


test('simultaneous valid PIN callbacks cannot produce two carrier connections',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const reservation=await reserve(env,'concurrent-pin-claims-0001');
  await approveReservation(env,reservation.id);
  const firstId=CID(220),secondId=CID(221);
  const [firstPrompt,secondPrompt]=await Promise.all([
    inbound(env,{call_id:firstId}),inbound(env,{call_id:secondId})
  ]);
  assert.ok(firstPrompt.doc?.sections?.main?.some(x=>x.prompt));
  assert.ok(secondPrompt.doc?.sections?.main?.some(x=>x.prompt));
  const results=await Promise.all([
    pin(env,firstId,reservation.dtmf_pin),
    pin(env,secondId,reservation.dtmf_pin)
  ]);
  assert.equal(results.filter(x=>connectOf(x.doc)).length,1,
    'exactly one competing signed PIN callback can connect');
  assert.equal(results.filter(x=>isHangup(x.doc)).length,1,
    'losing callback must hang up');
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM provider_events WHERE event_type='swml_pin' AND outcome='connect'").get().n,1);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,1);
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'connecting');
  assert.ok(isHangup((await pin(env,firstId,reservation.dtmf_pin)).doc),'replayed first callback hangs up');
  assert.ok(isHangup((await pin(env,secondId,reservation.dtmf_pin)).doc),'replayed second callback hangs up');
});


for(const [kind,trigger] of [
  ['ABORT',"SELECT RAISE(ABORT,'injected PIN outcome failure')"],
  ['IGNORE',"SELECT RAISE(IGNORE)"]
]){
  test('PIN callback: provider-event connect UPDATE '+kind+' fails closed without consuming reservation',async t=>{
    const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
    const b=await reserve(env,'pin-event-'+kind.toLowerCase()+'-1');
    assert.equal((await approveReservation(env,b.id)).status,200);
    const firstId=CID(kind==='ABORT'?310:320);
    const retryId=CID(kind==='ABORT'?311:321);
    const first=await inbound(env,{call_id:firstId});
    assert.ok(first.doc.sections.main.some(x=>x.prompt),'original call received a PIN challenge');
    DB.raw.exec("CREATE TRIGGER inject_pin_outcome BEFORE UPDATE OF outcome ON provider_events WHEN NEW.outcome='connect' AND NEW.event_type='swml_pin' BEGIN "+trigger+"; END");
    const failed=await pin(env,firstId,b.dtmf_pin);
    assert.equal(failed.status,200,'a failed DB transaction must return valid hangup SWML');
    assert.ok(isHangup(failed.doc),'never emit connect on failed event persistence');
    assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(b.id).status,'ready');
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(b.id).n,0);
    assert.notEqual(DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=? AND event_type='swml_pin'").get(firstId)?.outcome,'connect');
    DB.raw.exec('DROP TRIGGER inject_pin_outcome');
    const next=await inbound(env,{call_id:retryId});
    assert.ok(next.doc.sections.main.some(x=>x.prompt));
    const success=await pin(env,retryId,b.dtmf_pin);
    assert.equal(connectOf(success.doc)?.to,DEST,'fresh signed PIN attempt succeeds after transient failure');
    assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(b.id).status,'connecting');
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(b.id).n,1);
    assert.equal(DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=? AND event_type='swml_pin'").get(retryId).outcome,'connect');
  });
}


test('PIN callback: compound silent event and reservation-reset failures roll back atomically',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const reservation=await reserve(env,'pin-compound-silent-1');
  assert.equal((await approveReservation(env,reservation.id)).status,200);
  const firstId=CID(330);
  const retryId=CID(331);
  const challenge=await inbound(env,{call_id:firstId});
  assert.ok(challenge.doc.sections.main.some(x=>x.prompt),'initial signed call requests PIN');
  DB.raw.exec("CREATE TRIGGER ignore_pin_connect_compound BEFORE UPDATE OF outcome ON provider_events WHEN NEW.outcome='connect' AND NEW.event_type='swml_pin' BEGIN SELECT RAISE(IGNORE); END");
  DB.raw.exec("CREATE TRIGGER ignore_pin_reset_compound BEFORE UPDATE OF status ON reservations WHEN OLD.status='connecting' AND NEW.status='ready' BEGIN SELECT RAISE(IGNORE); END");
  const failed=await pin(env,firstId,reservation.dtmf_pin);
  assert.equal(failed.status,200,'failed transaction returns valid SWML');
  assert.ok(isHangup(failed.doc),'never connect after two silent database faults');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'ready','transaction must roll back claim');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,0,'no orphaned leg');
  assert.notEqual(DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=? AND event_type='swml_pin'").get(firstId)?.outcome,'connect','no false connect event');
  DB.raw.exec('DROP TRIGGER ignore_pin_connect_compound');
  DB.raw.exec('DROP TRIGGER ignore_pin_reset_compound');
  const next=await inbound(env,{call_id:retryId});
  assert.ok(next.doc.sections.main.some(x=>x.prompt),'new signed call can request PIN');
  assert.equal(connectOf((await pin(env,retryId,reservation.dtmf_pin)).doc)?.to,DEST,'fresh PIN callback connects after recovery');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,1);
  assert.equal(DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=? AND event_type='swml_pin'").get(retryId).outcome,'connect');
});

test('denied PIN claim remains hangup when CLAIM_LOST event update also aborts',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const reservation=await reserve(env,'pin-denial-outage-0001');
  assert.equal((await approveReservation(env,reservation.id)).status,200);
  const id=CID(340);
  assert.ok((await inbound(env,{call_id:id})).doc.sections.main.some(x=>x.prompt));
  DB.raw.exec("CREATE TRIGGER fail_pin_claim BEFORE INSERT ON reservation_carrier_legs BEGIN SELECT RAISE(ABORT,'claim unavailable'); END");
  DB.raw.exec("CREATE TRIGGER fail_pin_denial BEFORE UPDATE OF outcome ON provider_events WHEN NEW.outcome='CLAIM_LOST' BEGIN SELECT RAISE(ABORT,'denial telemetry unavailable'); END");
  const result=await pin(env,id,reservation.dtmf_pin);
  assert.equal(result.status,200,'DB outage must not become a 500');
  assert.ok(isHangup(result.doc),'no connection on failed claim or telemetry');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'ready');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,0);
  DB.raw.exec('DROP TRIGGER fail_pin_claim');
  DB.raw.exec('DROP TRIGGER fail_pin_denial');
  const retry=CID(341);
  assert.ok((await inbound(env,{call_id:retry})).doc.sections.main.some(x=>x.prompt));
  assert.equal(connectOf((await pin(env,retry,reservation.dtmf_pin)).doc)?.to,DEST);
});

test('inbound no-reservation denial survives provider-event outcome database failure',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  DB.raw.exec("CREATE TRIGGER fail_inbound_denial BEFORE UPDATE OF outcome ON provider_events WHEN NEW.outcome='no_approved_reservation' BEGIN SELECT RAISE(ABORT,'telemetry unavailable'); END");
  const result=await inbound(env,{call_id:CID(342)});
  assert.equal(result.status,200);
  assert.ok(isHangup(result.doc));
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
  DB.raw.exec('DROP TRIGGER fail_inbound_denial');
});

test('PIN prompt requires a durable challenge binding, including ignored and aborted writes',async t=>{
  for(const [kind,trigger] of [
    ['abort',"SELECT RAISE(ABORT,'injected challenge persistence failure')"],
    ['ignore','SELECT RAISE(IGNORE)']
  ]){
    const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
    const reservation=await reserve(env,'challenge-write-'+kind);
    await approveReservation(env,reservation.id);
    DB.raw.exec("CREATE TRIGGER fail_challenge BEFORE UPDATE OF outcome ON provider_events WHEN NEW.outcome='pin_requested' BEGIN "+trigger+"; END");
    const callId=CID(kind==='abort'?350:351);
    const result=await inbound(env,{call_id:callId});
    assert.equal(result.status,200,kind+' must return valid SWML');
    assert.ok(isHangup(result.doc),kind+' must never prompt without durable binding');
    assert.equal(DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=? AND event_type='swml_inbound'").get(callId)?.outcome,'received');
    assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'ready');
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,0);
    DB.raw.exec('DROP TRIGGER fail_challenge');
    const retry=await inbound(env,{call_id:CID(kind==='abort'?352:353)});
    assert.ok(retry.doc.sections.main.some(x=>x.prompt),'fresh challenge works after recovery');
  }
});

test('PIN attempt database ABORT returns safe hangup and preserves unclaimed route',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const reservation=await reserve(env,'pin-bump-outage-0001');
  await approveReservation(env,reservation.id);
  const id=CID(360);
  assert.ok((await inbound(env,{call_id:id})).doc.sections.main.some(x=>x.prompt));
  DB.raw.exec("CREATE TRIGGER abort_pin_bump BEFORE UPDATE OF pin_attempts ON reservations BEGIN SELECT RAISE(ABORT,'pin attempt DB outage'); END");
  const result=await pin(env,id,reservation.dtmf_pin);
  assert.equal(result.status,200);
  assert.ok(isHangup(result.doc),'PIN write failure must never connect');
  assert.deepEqual({...DB.raw.prepare('SELECT status,pin_attempts FROM reservations WHERE id=?').get(reservation.id)},{status:'ready',pin_attempts:0});
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,0);
  DB.raw.exec('DROP TRIGGER abort_pin_bump');
  const retry=CID(361);
  assert.ok((await inbound(env,{call_id:retry})).doc.sections.main.some(x=>x.prompt));
  assert.equal(connectOf((await pin(env,retry,reservation.dtmf_pin)).doc)?.to,DEST);
});

test('inbound reservation SELECT outage returns safe hangup without claiming',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const reservation=await reserve(env,'inbound-read-outage-1');
  await approveReservation(env,reservation.id);
  const original=env.DB;
  env.DB={prepare(sql){
    if(sql.includes('SELECT r.id,r.account_id,r.destination')&&sql.includes('ORDER BY r.created_at'))throw Error('injected D1 read outage');
    return original.prepare(sql);
  },batch:(...args)=>original.batch(...args)};
  const result=await inbound(env,{call_id:CID(362)});
  assert.equal(result.status,200);
  assert.ok(isHangup(result.doc),'read outage must never prompt or connect');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'ready');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,0);
  env.DB=original;
  const retry=await inbound(env,{call_id:CID(363)});
  assert.ok(retry.doc.sections.main.some(x=>x.prompt),'recovery allows a new challenge');
});


test('post-commit missing D1 metadata never downgrades a durable connect event',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const reservation=await reserve(env,'ambiguous-claim-meta-1');
  assert.equal((await approveReservation(env,reservation.id)).status,200);
  const id=CID(370);
  assert.ok((await inbound(env,{call_id:id})).doc.sections.main.some(x=>x.prompt));
  const original=env.DB;
  env.DB={prepare:(...args)=>original.prepare(...args),batch:async statements=>{
    const results=await original.batch(statements);
    return results.map(result=>({...result,meta:{}}));
  }};
  const result=await pin(env,id,reservation.dtmf_pin);
  assert.equal(result.status,200);
  assert.ok(isHangup(result.doc),'ambiguous post-commit response must not emit connect');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(reservation.id).n,1);
  assert.equal(DB.raw.prepare("SELECT outcome FROM provider_events WHERE provider_call_id=? AND event_type='swml_pin'").get(id).outcome,'connect','denial telemetry must not overwrite committed connect');
  env.DB=original;
});
