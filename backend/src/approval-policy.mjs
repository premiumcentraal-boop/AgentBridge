/**
 * Immutable, human-reviewed policy snapshot for one private US test reservation.
 * The owner receives this digest through a separate authenticated read-only URL.
 * A stale/replayed digest, a different destination, rate or cap cannot approve.
 * Enforced again immediately before a carrier connect is emitted.
 *
 * No provider API calls, AI voice, or payment actions.
 */
import {callerProofMode} from './caller-proof.mjs';
import {destinationDecision,routingCaps,maxCostCents} from './routing-policy.mjs';

export const PILOT_MAX_SECONDS=60;
export const PILOT_MAX_CALLS_PER_DAY=1;
export const PILOT_MAX_SPEND_CENTS=100;
export function pilotPolicy(row,env){
  if(!row||row.status!=='ready'||!Number.isSafeInteger(row.expires_at))
    return {ok:false,code:'RESERVATION_NOT_READY'};
  const decision=destinationDecision(row.destination,env);
  if(!decision.ok)return decision;
  if(decision.entry.country!=='US'||row.destination!==env.US_PILOT_TEST_DESTINATION)
    return {ok:false,code:'US_PILOT_EXACT_DESTINATION_REQUIRED'};
  if(env.US_PILOT_DESTINATION_VERIFIED!=='true')
    return {ok:false,code:'US_PILOT_DESTINATION_NOT_ATTESTED'};
  const mode=callerProofMode(env);
  // First US pilot MUST prove possession of the one-use challenge. Signed carrier
  // requests and caller-ID matching do NOT authenticate the calling person.
  // The legacy opt-in capped caller-ID mode remains in the library for
  // historical compatibility, but is explicitly non-routable in this pilot.
  if(mode!=='dtmf_pin')return {ok:false,code:'DTMF_PROOF_REQUIRED'};
  const caps=routingCaps(env,mode);
  if(!caps)return {ok:false,code:'CAPS_NOT_CONFIGURED'};
  if(caps.maxSeconds>PILOT_MAX_SECONDS||caps.maxCallsPerDay>PILOT_MAX_CALLS_PER_DAY||
    caps.maxCentsPerCall>PILOT_MAX_SPEND_CENTS||caps.maxCentsPerDay>PILOT_MAX_SPEND_CENTS)
    return {ok:false,code:'US_PILOT_CAPS_EXCEEDED'};
  // Reserve exposure for BOTH legs (inbound A-leg + onward B-leg).
  // Until provider billing is verified, budget four started A-leg minutes:
  // PIN/answer, ring timeout and the 60-second B-leg. This is an estimate,
  // NOT a carrier-side hard dollar limit.
  const inboundRate=Number(env.US_PILOT_INBOUND_RATE_CENTS_PER_MIN);
  if(typeof env.US_PILOT_INBOUND_RATE_CENTS_PER_MIN!=='string'||
     !/^\d+(?:\.\d{1,4})?$/.test(env.US_PILOT_INBOUND_RATE_CENTS_PER_MIN)||
     !Number.isFinite(inboundRate)||inboundRate<=0||inboundRate>1000||
     typeof env.US_PILOT_INBOUND_RATE_SOURCE!=='string'||
     !env.US_PILOT_INBOUND_RATE_SOURCE.trim())
    return {ok:false,code:'US_PILOT_INBOUND_RATE_UNVERIFIED'};
  const inboundMaxMinutes=4;
  const outboundCost=maxCostCents(decision.entry,caps.maxSeconds);
  const inboundCost=Math.ceil(inboundRate*inboundMaxMinutes);
  const maxCost=outboundCost+inboundCost;
  if(maxCost>caps.maxCentsPerCall||maxCost>caps.maxCentsPerDay)
    return {ok:false,code:'SPEND_ESTIMATE_EXCEEDS_CAP'};
  // The source is operator-supplied and NEVER a verified real-time carrier quote.
  const snapshot={
    reservation_id:row.id,account_id:row.account_id,destination:row.destination,
    expires_at:row.expires_at,country:'US',caller_proof:mode,
    rate_cents_per_min:decision.entry.rate_cents_per_min,
    rate_source:decision.entry.rate_source,
    inbound_rate_cents_per_min:inboundRate,
    inbound_rate_source:env.US_PILOT_INBOUND_RATE_SOURCE.trim(),
    inbound_estimated_max_minutes:inboundMaxMinutes,
    max_call_seconds:caps.maxSeconds,max_calls_per_day:caps.maxCallsPerDay,
    max_spend_cents_per_call:caps.maxCentsPerCall,
    max_spend_cents_per_day:caps.maxCentsPerDay,
    estimated_max_cost_cents:maxCost,price_verified:false
  };
  return {ok:true,snapshot};
}
export async function policyFingerprint(snapshot){
  const message=JSON.stringify(snapshot);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyApprovalBinding(env,row){
  const p=pilotPolicy(row,env);
  if(!p.ok)return false;
  const expected=await policyFingerprint(p.snapshot);
  try{
    const saved=await env.DB.prepare('SELECT policy_sha256 FROM reservation_approval_bindings WHERE reservation_id=?')
      .bind(row.id).first();
    return typeof saved?.policy_sha256==='string'&&
      saved.policy_sha256===expected;
  }catch{return false;} // missing migration or transient D1 error always means no connect
}
