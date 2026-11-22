/** Offline cross-stage regression: owner consent, signed challenge, ambiguous D1 commit.
 * Synthetic carrier payloads only. Never enable routing or use a real provider.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,owner,approveReservation,swml,call,DEST,DID,PIN_URL} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const cid=n=>'38313c74-b321-4c08-a3ea-'+String(n).padStart(12,'0');
const hangup=doc=>doc?.sections?.main?.some(section=>section.hangup!==undefined);
const legCount=(DB,id)=>DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs WHERE reservation_id=?').get(id).n;
const state=(DB,id)=>DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(id).status;

test('owner denial through ambiguous committed PIN response never produces a second leg',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
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

  const approved=await approveReservation(env,reservation.id);
  assert.equal(approved.status,200);
  const challengeId=cid(902);
  const challenge=await worker.fetch(swml({call:call({call_id:challengeId})}),env);
  assert.equal(challenge.status,200);
  const prompt=await challenge.json();
  assert.ok(prompt.sections.main.some(section=>section.prompt),'signed inbound creates a PIN challenge');
  assert.equal(legCount(DB,reservation.id),0);
  const badPin=await worker.fetch(swml({call:call({call_id:challengeId}),params:{digits:'00000000'},vars:{prompt_value:'00000000'}},PIN_URL),env);
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
