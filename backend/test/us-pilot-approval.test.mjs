import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {pilotPolicy,policyFingerprint,verifyApprovalBinding} from '../src/approval-policy.mjs';
import {routingSetup,api,owner,approveReservation,DEST,INTL,T0} from './helpers/routing-env.mjs';

async function reserve(env,key='us-pilot-owner-1',destination=DEST){
  return worker.fetch(api('/v1/reservations','POST',{destination,idempotency_key:key}),env);
}

test('pilot refuses non-US destination, no attestation, missing inbound rate and overly high caps BEFORE creating a reservation',async t=>{
  const changes=[
    [{US_PILOT_DESTINATION_VERIFIED:undefined},'US_PILOT_DESTINATION_NOT_ATTESTED'],
    [{US_PILOT_TEST_DESTINATION:INTL},'US_PILOT_EXACT_DESTINATION_REQUIRED'],
    [{US_PILOT_INBOUND_RATE_CENTS_PER_MIN:undefined},'US_PILOT_INBOUND_RATE_UNVERIFIED'],
    [{US_PILOT_INBOUND_RATE_CENTS_PER_MIN:'0'},'US_PILOT_INBOUND_RATE_UNVERIFIED'],
    [{US_PILOT_INBOUND_RATE_CENTS_PER_MIN:'NaN'},'US_PILOT_INBOUND_RATE_UNVERIFIED'],
    [{US_PILOT_INBOUND_RATE_SOURCE:''},'US_PILOT_INBOUND_RATE_UNVERIFIED'],
    [{ROUTING_MAX_CALL_SECONDS:'61'},'US_PILOT_CAPS_EXCEEDED'],
    [{ROUTING_MAX_CALLS_PER_DAY:'2'},'US_PILOT_CAPS_EXCEEDED'],
    [{ROUTING_MAX_SPEND_CENTS_PER_CALL:'101'},'US_PILOT_CAPS_EXCEEDED'],
    [{ROUTING_MAX_SPEND_CENTS_PER_DAY:'101'},'US_PILOT_CAPS_EXCEEDED']
  ];
  for(const [config,code] of changes){
    const {env,DB}=await routingSetup(t,config);
    const response=await reserve(env,'failing-case-'+code.toLowerCase().slice(0,20));
    assert.equal(response.status,409,JSON.stringify(config));
    const body=await response.json();
    assert.equal(body.error.code,'US_PILOT_NOT_READY');
    assert.match(body.error.message,new RegExp(code));
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0,
      'invalid pilot settings must never create a ready reservation');
  }
});

test('out-of-band owner review binds exact destination/rate/duration/policy digest and rejects stale quotes',async t=>{
  const {env,DB}=await routingSetup(t,{CALLER_PROOF_MODE:'dtmf_pin'});
  const res=await reserve(env);
  assert.equal(res.status,201);
  const created=await res.json();
  assert.equal(created.estimate.max_call_seconds,60);
  assert.equal(created.estimate.max_cost_cents,6,'two legs estimated');
  assert.equal(created.estimate.price_verified,false);
  const reviewing=await worker.fetch(owner(created.id,'review'),env);
  assert.equal(reviewing.status,200);
  const proposal=await reviewing.json();
  assert.equal(proposal.proposal.destination,DEST);
  assert.equal(proposal.proposal.inbound_rate_cents_per_min,1);
  assert.equal(proposal.proposal.max_call_seconds,60);
  assert.equal(proposal.proposal.price_verified,false);
  assert.equal(proposal.proposal.caller_proof,'dtmf_pin');
  assert.match(proposal.proposal_digest,/^[a-f0-9]{64}$/);
  assert.equal((await worker.fetch(owner(created.id,'approve'),env)).status,422,
    'approving without reviewing/echoing proposal fails');
  assert.equal((await worker.fetch(owner(created.id,'approve',undefined,'a'.repeat(64)),env)).status,409);
  const approved=await worker.fetch(owner(created.id,'approve',undefined,proposal.proposal_digest),env);
  assert.equal(approved.status,200);
  assert.equal((await worker.fetch(owner(created.id,'approve',undefined,proposal.proposal_digest),env)).status,409);
  const sql=DB.raw.prepare('SELECT policy_sha256 FROM reservation_approval_bindings WHERE reservation_id=?').get(created.id);
  assert.equal(sql.policy_sha256,proposal.proposal_digest);
  const row=DB.raw.prepare('SELECT * FROM reservations WHERE id=?').get(created.id);
  assert.equal(await verifyApprovalBinding(env,row),true);
  assert.equal(await verifyApprovalBinding({...env,US_PILOT_INBOUND_RATE_CENTS_PER_MIN:'2'},row),false);
  assert.equal(await verifyApprovalBinding({...env,ROUTING_MAX_CALL_SECONDS:'30'},row),false);
  assert.equal(await verifyApprovalBinding({...env,ROUTING_DESTINATIONS:JSON.stringify([
    {e164:DEST,country:'US',rate_cents_per_min:3,rate_source:'changed-rate'}])},row),false);
  const bad=pilotPolicy(row,{...env,US_PILOT_TEST_DESTINATION:INTL});
  assert.equal(bad.ok,false);
});

test('originally reviewed but changed quote is rejected during owner approval',async t=>{
  const {env,DB}=await routingSetup(t);
  const res=await reserve(env,'us-pilot-owner-2');
  const created=await res.json();
  const review=await (await worker.fetch(owner(created.id,'review'),env)).json();
  const altered={...env,ROUTING_DESTINATIONS:JSON.stringify([
    {e164:DEST,country:'US',rate_cents_per_min:8,rate_source:'changed-after-review'}])};
  const approved=await worker.fetch(owner(created.id,'approve',undefined,review.proposal_digest),altered);
  assert.equal(approved.status,409);
  assert.equal((await approved.json()).error.code,'PROPOSAL_CHANGED');
  assert.equal(DB.raw.prepare('SELECT approved_at FROM reservations WHERE id=?').get(created.id).approved_at,null);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_approval_bindings').get().n,0);
});

test('mark-ended cannot unlock a connecting SignalWire call without reconciled voice logs',async t=>{
  const {env,DB}=await routingSetup(t,{CALLER_PROOF_MODE:'dtmf_pin'});
  const created=await (await reserve(env,'us-pilot-owner-3')).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  DB.raw.prepare("UPDATE reservations SET status='connecting',provider='signalwire',provider_call_id='38313c74-b321-4c08-a3ea-7123449130ab',max_cost_cents=6 WHERE id=?").run(created.id);
  DB.raw.prepare("INSERT INTO reservation_carrier_legs (reservation_id,provider_segment_id,claimed_at) VALUES (?, ?, ?)")
    .run(created.id,'48313c74-b321-4c08-a3ea-7123449130ab',T0);
  const response=await worker.fetch(owner(created.id,'mark-ended'),env);
  assert.equal(response.status,409);
  assert.equal((await response.json()).error.code,'CARRIER_RECONCILIATION_REQUIRED');
  assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(created.id).status,'connecting',
    'without a Voice-scoped credential or proven termination, lock persists');
});
