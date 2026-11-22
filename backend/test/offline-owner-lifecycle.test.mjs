/** Offline cross-stage regression: owner consent, signed challenge, ambiguous D1 commit.
 * Synthetic carrier payloads only. Never enable routing or use a real provider.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,approveReservation,swml,call,DEST,PIN_URL} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const cid=n=>'38313c74-b321-4c08-a3ea-'+String(n).padStart(12,'0');
const hangup=doc=>doc?.sections?.main?.some(section=>section.hangup!==undefined);
const legCount=(DB,id)=>DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(id).n;
const state=(DB,id)=>DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(id).status;

test('owner denial through ambiguous committed PIN response never produces a second leg',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  // Any unexpected real carrier/network request is a hard test failure.
  // The Worker is invoked in-process; all provider evidence here is synthetic.
  t.mock.method(globalThis,'fetch',async()=>{throw Error('unexpected external HTTP in offline lifecycle test');});
  const reservationResponse=await worker.fetch(api('/v1/reservations','POST',{
    destination:DEST,idempotency_key:'offline-lifecycle-001'
  }),env);
  assert.equal(reservationResponse.status,201);
  const reservation=await reservationResponse.json();
  assert.equal(state(DB,reservation.id),'ready');
  assert.equal(legCount(DB,reservation.id),0);

  const unauthorized=await approveReservation(env,reservation.id,'wrong-owner-token');
  assert.notEqual(unauthorized.status,200,'agent or invalid owner cannot approve');
  assert.equal(state(DB,reservation.id),'ready');
  assert.equal(legCount(DB,reservation.id),0);
  const unapproved=await worker.fetch(swml({call:call({call_id:cid(901)})}),env);
  assert.equal(unapproved.status,200);
  assert.ok(hangup(await unapproved.json()),'no challenge without owner consent');
  assert.equal(legCount(DB,reservation.id),0);

  const forged=await worker.fetch(swml({call:call({call_id:cid(905)})},undefined,{key:'incorrect-synthetic-signing-key'}),env);
  assert.notEqual(forged.status,200,'forged SignalWire webhook must fail signature verification');
  assert.equal(legCount(DB,reservation.id),0);
  assert.equal(state(DB,reservation.id),'ready');

  const approved=await approveReservation(env,reservation.id);
  assert.equal(approved.status,200);
  const challengeId=cid(902);
  const challenge=await worker.fetch(swml({call:call({call_id:challengeId})}),env);
  assert.equal(challenge.status,200);
  const prompt=await challenge.json();
  assert.ok(prompt.sections.main.some(section=>section.prompt),'signed inbound creates a PIN challenge');
  assert.equal(legCount(DB,reservation.id),0);
  const wrong=reservation.dtmf_pin==='00000000'?'11111111':'00000000';
  const badPin=await worker.fetch(swml({call:call({call_id:challengeId}),params:{digits:wrong},vars:{prompt_value:wrong}},PIN_URL),env);
  assert.equal(badPin.status,200);
  assert.ok(hangup(await badPin.json()),'bad PIN fails closed');
  assert.equal(legCount(DB,reservation.id),0);

  const goodId=cid(903);
  const secondChallenge=await worker.fetch(swml({call:call({call_id:goodId})}),env);
  assert.equal(secondChallenge.status,200);
  assert.ok((await secondChallenge.json()).sections.main.some(section=>section.prompt));
  const original=env.DB;
  env.DB={prepare:(...args)=>original.prepare(...args),batch:async statements=>{
    await original.batch(statements);
    throw Error('synthetic response lost after durable D1 commit');
  }};
  const pinRequest=()=>swml({call:call({call_id:goodId}),params:{digits:reservation.dtmf_pin},vars:{prompt_value:reservation.dtmf_pin}},PIN_URL);
  const uncertain=await worker.fetch(pinRequest(),env);
  assert.equal(uncertain.status,200);
  assert.ok(hangup(await uncertain.json()),'ambiguous D1 outcome cannot emit carrier connect');
  env.DB=original;
  assert.equal(state(DB,reservation.id),'connecting','committed lock must survive lost response');
  assert.equal(legCount(DB,reservation.id),1,'exactly one durable leg claim');

  const replay=await worker.fetch(pinRequest(),env);
  assert.equal(replay.status,200);
  assert.ok(hangup(await replay.json()),'replayed proof cannot connect');
  const another=await worker.fetch(swml({call:call({call_id:cid(904)})}),env);
  assert.equal(another.status,200);
  assert.ok(hangup(await another.json()),'new inbound cannot reuse uncertain reservation');
  assert.equal(legCount(DB,reservation.id),1);
  assert.equal(state(DB,reservation.id),'connecting');
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM provider_events WHERE provider_call_id=? AND event_type='swml_pin'").get(goodId).n,1);
});


test('carrier finality is denied on missing or contradictory evidence, then releases only on exact logs',async t=>{
  const {env,DB}=await routingSetup(t,{
    ...FLAGS,SIGNALWIRE_SPACE:'example-space',SIGNALWIRE_VOICE_API_TOKEN:'synthetic-read-only-token'
  });
  const created=await worker.fetch(api('/v1/reservations','POST',{
    destination:DEST,idempotency_key:'offline-finality-001'
  }),env);
  assert.equal(created.status,201);
  const {id}=await created.json();
  assert.equal((await approveReservation(env,id)).status,200);
  const inbound=cid(951),segment='4'+inbound.slice(1),child=cid(952);
  DB.raw.prepare("UPDATE reservations SET status='connecting',provider='signalwire',provider_call_id=?,claimed_at=?,max_cost_cents=50 WHERE id=?")
    .run(inbound,1800000000,id);
  DB.raw.prepare('INSERT INTO reservation_carrier_legs (reservation_id,provider_segment_id,claimed_at) VALUES (?,?,?)')
    .run(id,segment,1800000000);
  const {BASE,OWNER,DID}=await import('./helpers/routing-env.mjs');
  const review=()=>new Request(BASE+'/v1/owner/reservations/'+id+'/force-unlock',{
    method:'POST',headers:{authorization:'Bearer '+OWNER,'content-type':'application/json'},
    body:JSON.stringify({})
  });
  const inboundLog={id:segment,parent_id:null,direction:'inbound',status:'completed',to:DID,charge:0.01};
  const childLog={id:child,parent_id:segment,direction:'outbound',status:'completed',from:DID,to:DEST,charge:0.02};
  let mode='unavailable',seen=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    seen.push({url:String(url),method:options?.method});
    assert.match(String(url),/^https:\/\/example-space\.signalwire\.com\/api\/voice\/logs/);
    assert.equal(options?.method,'GET','carrier reconciliation must never issue a paid command');
    if(mode==='unavailable')return new Response('provider unavailable',{status:503});
    if(mode==='unauthorized')return new Response('invalid provider token',{status:401});
    if(mode==='rate-limited')return new Response('slow down',{status:429,headers:{'retry-after':'60'}});
    const data=String(url).endsWith('/'+segment)?inboundLog:{
      data:mode==='contradictory'?[childLog,{...childLog,id:cid(953)}]:mode==='missing-child'?[]:[childLog],
      links:{self:'synthetic-self',first:'synthetic-first'}
    };
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  });
  // A caller with no owner authority must never trigger carrier-log reads or unlock.
  const unauthorizedReview=new Request(BASE+'/v1/owner/reservations/'+id+'/force-unlock',{
    method:'POST',headers:{authorization:'Bearer invalid-owner-token','content-type':'application/json'},
    body:JSON.stringify({})
  });
  const unauthorizedResult=await worker.fetch(unauthorizedReview,env);
  assert.notEqual(unauthorizedResult.status,200,'unauthorized finality must be rejected');
  assert.equal(seen.length,0,'invalid owner token must not access carrier logs');
  assert.equal(state(DB,id),'connecting');
  assert.equal(legCount(DB,id),1);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);

  for(const failure of ['unavailable','unauthorized','rate-limited','missing-child','contradictory']){
    mode=failure;
    const result=await worker.fetch(review(),env);
    assert.equal(result.status,409,failure+' must retain unresolved reservation');
    assert.equal(state(DB,id),'connecting');
    assert.equal(legCount(DB,id),1);
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions WHERE reservation_id=?').get(id).n,0);
    assert.equal((await worker.fetch(api('/v1/reservations','POST',{
      destination:DEST,idempotency_key:'offline-finality-'+failure
    }),env)).status,409,'unresolved carrier evidence blocks next reservation');
  }
  mode='verified';
  const verified=await worker.fetch(review(),env);
  assert.equal(verified.status,200);
  assert.equal((await verified.json()).carrier_confirmed,true);
  assert.equal(state(DB,id),'completed');
  assert.equal(legCount(DB,id),1);
  assert.equal(DB.raw.prepare('SELECT actual_cost_cents FROM reservation_carrier_legs WHERE reservation_id=?').get(id).actual_cost_cents,3);
  assert.equal((await worker.fetch(review(),env)).status,409,'terminal reservation cannot reconcile twice');
  assert.ok(seen.length>=4);
  assert.deepEqual([...new Set(seen.map(x=>x.method))],['GET']);
});
