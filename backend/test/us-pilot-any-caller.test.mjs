import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {callerProofMode} from '../src/caller-proof.mjs';
import {routingSetup,api,owner,approveReservation,swml,call,DEST,INTL,T0} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const ANY={CALLER_PROOF_MODE:'any_caller',ANY_CALLER_RISK_ACCEPTED:'true',TEST_CALLER_E164:'',
  ROUTING_MAX_CALL_SECONDS:'600',ROUTING_MAX_CALLS_PER_DAY:'4',
  ROUTING_MAX_SPEND_CENTS_PER_CALL:'50',ROUTING_MAX_SPEND_CENTS_PER_DAY:'100',RESERVATION_TTL_SECONDS:'900'};
const CID=n=>'3'+String(n).padStart(7,'0')+'-b321-4c08-a3ea-7123449130ab';
const reserve=(env,key,destination=DEST)=>worker.fetch(api('/v1/reservations','POST',{destination,idempotency_key:key}),env);
async function inbound(env,over,opts){
  const r=await worker.fetch(swml({call:call(over)},undefined,opts),env);
  return {status:r.status,doc:r.status===200?await r.json():null};
}
const connectOf=doc=>doc?.sections?.main?.find(s=>s.connect)?.connect;
const isHangup=doc=>Array.isArray(doc?.sections?.main)&&doc.sections.main.length===1&&'hangup' in doc.sections.main[0];
const status=(DB,id)=>DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(id).status;

test('any_caller requires the exact ANY_CALLER_RISK_ACCEPTED opt-in',async t=>{
  assert.equal(callerProofMode({CALLER_PROOF_MODE:'any_caller'}),'none');
  assert.equal(callerProofMode({CALLER_PROOF_MODE:'any_caller',ANY_CALLER_RISK_ACCEPTED:'TRUE'}),'none');
  assert.equal(callerProofMode({CALLER_PROOF_MODE:'any_caller',ANY_CALLER_RISK_ACCEPTED:'true'}),'any_caller');
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY,ANY_CALLER_RISK_ACCEPTED:undefined});
  assert.equal((await reserve(env,'any-no-optin')).status,409);
  assert.ok(isHangup((await inbound(env,{call_id:CID(1),from_number:'+13125550142'})).doc));
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
});

test('any_caller: rotating caller IDs connect once to the single approved destination, 600 s cap',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  const created=await (await reserve(env,'any-flow-0001')).json();
  assert.equal(created.caller_proof,'any_caller');
  assert.equal(created.dtmf_pin,undefined);
  assert.equal(created.max_call_seconds,600);
  assert.equal(Date.parse(created.expires_at)/1000,T0+900,'15-minute reservation window');
  const review=await (await worker.fetch(owner(created.id,'review'),env)).json();
  assert.equal(review.proposal.trusted_caller,'ANY');
  assert.equal(review.proposal.any_caller_risk_accepted,true);
  // Not approved yet: no connect for anyone.
  assert.ok(isHangup((await inbound(env,{call_id:CID(2),from_number:'+13125550142'})).doc));
  assert.equal((await approveReservation(env,created.id)).status,200);
  // Unsigned/forged still rejected.
  assert.equal((await inbound(env,{call_id:CID(3)},{sign:false})).status,403);
  assert.equal((await inbound(env,{call_id:CID(4)},{key:'another-signing-key-xxxxxxxxxxxx'})).status,403);
  // A never-seen caller ID gets the leg.
  const ok=await inbound(env,{call_id:CID(5),from_number:'+13125550142'});
  const c=connectOf(ok.doc);
  assert.equal(c?.to,DEST);
  assert.equal(c.max_duration,600);
  assert.equal(status(DB,created.id),'connecting');
  // Single use: a second (different-number) call cannot reuse it.
  assert.ok(isHangup((await inbound(env,{call_id:CID(6),from_number:'+13125550143'})).doc));
  const log=DB.raw.prepare('SELECT from_number,handler,outcome FROM inbound_call_log ORDER BY id').all().map(x=>({...x}));
  assert.deepEqual(log.map(x=>x.from_number),['+13125550142','+13125550142','+13125550143']);
  assert.ok(log.every(x=>x.handler==='swml_routing'&&x.outcome==='mode_any_caller'));
});

test('any_caller keeps destination allowlist, caps, expiry and approval binding',async t=>{
  // Non-allowlisted / international destination never becomes a reservation.
  {const {env}=await routingSetup(t,{...FLAGS,...ANY});
   for(const [k,d] of [['any-intl-dest-0001',INTL],['any-other-dest-0001','+12125550111']]){
     const st=(await reserve(env,k,d)).status;
     assert.ok(st===403||st===409,k+' refused ('+st+')');
   }
   assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);}
  for(const [k,v] of [['ROUTING_MAX_CALL_SECONDS','601'],['ROUTING_MAX_CALLS_PER_DAY','5'],['ROUTING_MAX_SPEND_CENTS_PER_DAY','101']]){
    const {env}=await routingSetup(t,{...FLAGS,...ANY,[k]:v});
    assert.equal((await reserve(env,'any-cap-case-'+k.length)).status,409,k);
  }
  // Expired approved reservation cannot be claimed.
  {const {env,DB,at}=await routingSetup(t,{...FLAGS,...ANY});
   const r=await (await reserve(env,'any-expired-0001')).json();
   assert.ok(r.id,JSON.stringify(r));
   await approveReservation(env,r.id);
   at(T0+901);
   assert.ok(isHangup((await inbound(env,{call_id:CID(7)})).doc));
   assert.notEqual(status(DB,r.id),'connecting');}
  // Switching the mode after approval invalidates the approval fingerprint.
  {const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
   const r=await (await reserve(env,'any-mode-switch-0001')).json();
   await approveReservation(env,r.id);
   const switched={...env,CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',
     US_PILOT_ALLOW_CALLER_ID_PROOF:'true',TEST_CALLER_E164:'+12125550177'};
   assert.ok(isHangup((await inbound(switched,{call_id:CID(8)})).doc));
   assert.equal(status(DB,r.id),'ready');}
  // Flags off: hangup only, even with an approved any_caller reservation.
  {const {env,DB}=await routingSetup(t,{...ANY});
   const r=await (await reserve(env,'any-flags-off-0001')).json();
   await approveReservation(env,r.id);
   const res=await inbound(env,{call_id:CID(9),from_number:'+13125550142'});
   assert.ok(isHangup(res.doc));
   assert.equal(status(DB,r.id),'ready');}
});

test('carrier-leg insertion failure rolls back the claim and permits a later authorized retry',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  const created=await (await reserve(env,'any-atomic-claim-1')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  DB.raw.exec("CREATE TRIGGER reject_carrier_leg BEFORE INSERT ON reservation_carrier_legs BEGIN SELECT RAISE(ABORT,'injected leg failure'); END");
  const failed=await inbound(env,{call_id:CID(91)});
  assert.ok(isHangup(failed.doc),'a failed transactional claim must not emit connect');
  assert.equal(status(DB,created.id),'ready','the reservation must not be stranded connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,0);
  DB.raw.exec('DROP TRIGGER reject_carrier_leg');
  const retry=await inbound(env,{call_id:CID(92)});
  assert.equal(connectOf(retry.doc)?.to,DEST,'a new signed call can claim after the transient DB failure');
  assert.equal(status(DB,created.id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,1);
  assert.ok(isHangup((await inbound(env,{call_id:CID(93)})).doc),'a successful claim remains single-use');
});

test('silently ignored carrier-leg INSERT cannot strand the reservation',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  const created=await (await reserve(env,'any-silent-insert-1')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  DB.raw.exec("CREATE TRIGGER ignore_carrier_leg BEFORE INSERT ON reservation_carrier_legs BEGIN SELECT RAISE(IGNORE); END");
  const failed=await inbound(env,{call_id:CID(94)});
  assert.ok(isHangup(failed.doc),'a suppressed carrier-leg write must never emit connect');
  assert.equal(status(DB,created.id),'ready','no stranded connecting reservation');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,0);
  DB.raw.exec('DROP TRIGGER ignore_carrier_leg');
  const retry=await inbound(env,{call_id:CID(95)});
  assert.equal(connectOf(retry.doc)?.to,DEST);
  assert.equal(status(DB,created.id),'connecting');
});

test('silently ignored reservation UPDATE removes orphan carrier leg and allows retry',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  const created=await (await reserve(env,'any-silent-update-1')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  DB.raw.exec("CREATE TRIGGER ignore_reservation_claim BEFORE UPDATE OF status ON reservations WHEN NEW.status='connecting' BEGIN SELECT RAISE(IGNORE); END");
  const failed=await inbound(env,{call_id:CID(96)});
  assert.ok(isHangup(failed.doc),'suppressed reservation transition cannot emit connect');
  assert.equal(status(DB,created.id),'ready');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,0,
    'transaction must clean up the inserted leg after the ignored UPDATE');
  DB.raw.exec('DROP TRIGGER ignore_reservation_claim');
  const retry=await inbound(env,{call_id:CID(97)});
  assert.equal(connectOf(retry.doc)?.to,DEST);
  assert.equal(status(DB,created.id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,1);
  assert.ok(isHangup((await inbound(env,{call_id:CID(98)})).doc));
});


test('reservation UPDATE exception rolls back inserted carrier leg and permits retry',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  const created=await (await reserve(env,'any-abort-update-1')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  DB.raw.exec("CREATE TRIGGER abort_reservation_claim BEFORE UPDATE OF status ON reservations WHEN NEW.status='connecting' BEGIN SELECT RAISE(ABORT,'injected reservation update failure'); END");
  const failed=await inbound(env,{call_id:CID(140)});
  assert.ok(isHangup(failed.doc),'a failing reservation transition cannot emit connect');
  assert.equal(status(DB,created.id),'ready','transaction rolls back the reservation transition');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,0,
    'the preceding carrier-leg INSERT must roll back with the failed UPDATE');
  DB.raw.exec('DROP TRIGGER abort_reservation_claim');
  const retry=await inbound(env,{call_id:CID(141)});
  assert.equal(connectOf(retry.doc)?.to,DEST);
  assert.equal(status(DB,created.id),'connecting');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(created.id).n,1);
  assert.ok(isHangup((await inbound(env,{call_id:CID(142)})).doc));
});

test('simultaneous signed inbound claims cannot create two carrier legs or two connects',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  const created=await (await reserve(env,'any-concurrent-claim-1')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  const ids=Array.from({length:12},(_,i)=>CID(110+i));
  const results=await Promise.all(ids.map(call_id=>inbound(env,{call_id})));
  const connected=results.filter(r=>connectOf(r.doc));
  assert.equal(connected.length,1,'only one simultaneous callback may receive a connect');
  assert.ok(results.every(r=>r.status===200),'all valid signed callbacks receive SWML');
  assert.ok(results.filter(r=>!connectOf(r.doc)).every(r=>isHangup(r.doc)),
    'every losing callback must hang up');
  assert.equal(status(DB,created.id),'connecting');
  const legs=DB.raw.prepare('SELECT provider_segment_id FROM reservation_carrier_legs WHERE reservation_id=?').all(created.id);
  assert.equal(legs.length,1,'exactly one carrier leg persisted');
  assert.ok(isHangup((await inbound(env,{call_id:CID(130)})).doc),'replay window remains closed');
});
