import test from 'node:test';
import assert from 'node:assert/strict';
import {blockedReason,destinationDecision,parseDestinations,routingCaps,maxCostCents,reservationTtlSeconds,utcDayStart} from '../src/routing-policy.mjs';

const DID='+12025550123';
const env={US_BRIDGE_DID:DID,ROUTING_ALLOWED_COUNTRIES:'US,NL',ROUTING_DESTINATIONS:JSON.stringify([
  {e164:'+12125550100',country:'US',rate_cents_per_min:1.2,rate_source:'SignalWire pricing page 2026-11-09'},
  {e164:'+31201234567',country:'NL',rate_cents_per_min:8,rate_source:'SignalWire pricing page 2026-11-09'},
  {e164:'+442071234567',country:'GB',rate_cents_per_min:5,rate_source:'x'},
  {e164:'+12125550101',country:'US',rate_source:'missing rate'},
  {e164:'+12125550102',country:'US',rate_cents_per_min:1,rate_source:''}
])};

test('emergency, premium, short, satellite, non-US NANP and bridge numbers are always blocked',()=>{
  for(const [n,code] of [['911','INVALID_E164'],['+911','INVALID_E164'],[DID,'BRIDGE_DID'],
    ['+19005551234','NANP_NON_US_OR_PREMIUM'],['+12129765555','PREMIUM_OR_SPECIAL'],['+18765551234','NANP_NON_US_OR_PREMIUM'],
    ['+14165551234','NANP_NON_US_OR_PREMIUM'],['+18095551234','NANP_NON_US_OR_PREMIUM'],['+15005551234','NANP_NON_US_OR_PREMIUM'],
    ['+97912345678','PREMIUM_OR_SPECIAL'],['+881612345678','PREMIUM_OR_SPECIAL'],['+80012345678','PREMIUM_OR_SPECIAL'],
    ['+12125111234','EMERGENCY_OR_N11'],['+11125551234','INVALID_NANP'],['+12125551234',null],['+31201234567',null]])
    assert.equal(blockedReason(n,env),code,n);
});
test('allowlist requires exact E.164, known country, allowed country and a sourced rate',()=>{
  assert.deepEqual(parseDestinations(env).map(d=>d.e164),['+12125550100','+31201234567','+442071234567']);
  assert.equal(destinationDecision('+12125550100',env).ok,true);
  assert.equal(destinationDecision('+31201234567',env).ok,true);
  assert.equal(destinationDecision('+442071234567',env).code,'COUNTRY_NOT_ALLOWED');
  assert.equal(destinationDecision('+12125550199',env).code,'NOT_ALLOWLISTED');
  assert.equal(destinationDecision('+12125550101',env).code,'NOT_ALLOWLISTED');
  assert.equal(destinationDecision('+12125550100',{...env,ROUTING_ALLOWED_COUNTRIES:''}).code,'COUNTRY_NOT_ALLOWED');
  const lying={...env,ROUTING_DESTINATIONS:JSON.stringify([{e164:'+31201234567',country:'US',rate_cents_per_min:1,rate_source:'x'}])};
  assert.equal(destinationDecision('+31201234567',lying).code,'COUNTRY_MISMATCH');
  assert.deepEqual(parseDestinations({ROUTING_DESTINATIONS:'not json'}),[]);
});
test('caps are all required, bounded, and tighter in caller-ID mode',()=>{
  const caps={ROUTING_MAX_CALL_SECONDS:'180',ROUTING_MAX_CALLS_PER_DAY:'5',ROUTING_MAX_SPEND_CENTS_PER_CALL:'100',ROUTING_MAX_SPEND_CENTS_PER_DAY:'300'};
  assert.deepEqual(routingCaps(caps,'dtmf_pin'),{maxSeconds:180,maxCallsPerDay:5,maxCentsPerCall:100,maxCentsPerDay:300});
  assert.deepEqual(routingCaps(caps,'capped_caller_id'),{maxSeconds:120,maxCallsPerDay:3,maxCentsPerCall:100,maxCentsPerDay:300});
  assert.deepEqual(routingCaps({...caps,ROUTING_MAX_CALL_SECONDS:'600'},'dtmf_pin').maxSeconds,600,'10-minute hard ceiling');
  // Pilot opt-in lifts the generic caller-ID clamp (pilot policy applies its own limits).
  const optIn={...caps,ROUTING_MAX_CALL_SECONDS:'600',CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',
    US_PILOT_ALLOW_CALLER_ID_PROOF:'true',TEST_CALLER_E164:'+12125550177',US_BRIDGE_DID:'+12025550123'};
  assert.equal(routingCaps(optIn,'capped_caller_id').maxSeconds,600);
  assert.equal(routingCaps({...optIn,US_PILOT_ALLOW_CALLER_ID_PROOF:'1'},'capped_caller_id').maxSeconds,120);
  for(const k of Object.keys(caps))assert.equal(routingCaps({...caps,[k]:undefined}),null,k);
  assert.equal(routingCaps({...caps,ROUTING_MAX_CALL_SECONDS:'601'}),null);
  assert.equal(routingCaps({...caps,ROUTING_MAX_CALL_SECONDS:'1e2'}),null);
  assert.equal(maxCostCents({rate_cents_per_min:1.2},180),4);
  assert.equal(maxCostCents({rate_cents_per_min:8},61),16);
  assert.equal(reservationTtlSeconds({}),90);
  assert.equal(reservationTtlSeconds({RESERVATION_TTL_SECONDS:'240'}),240);
  assert.equal(reservationTtlSeconds({RESERVATION_TTL_SECONDS:'900'}),900,'15-minute maximum');
  assert.equal(reservationTtlSeconds({RESERVATION_TTL_SECONDS:'901'}),90);
  assert.equal(reservationTtlSeconds({RESERVATION_TTL_SECONDS:'9999'}),90);
  assert.equal(utcDayStart(86_400*3+5),86_400*3);
});
