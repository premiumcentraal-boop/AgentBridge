/**
 * Immutable, human-reviewed policy snapshot for one private US test reservation.
 * The owner receives this digest through a separate authenticated read-only URL.
 * A stale/replayed digest, a different destination, rate or cap cannot approve.
 * Enforced again immediately before a carrier connect is emitted.
 *
 * No provider API calls, AI voice, or payment actions.
 */
import {callerProofMode,callerIdPilotOptIn} from './caller-proof.mjs';
import {destinationDecision,routingCaps,maxCostCents} from './routing-policy.mjs';

// Hard US-pilot ceilings. Owner config may only be stricter.
export const PILOT_MAX_SECONDS=600;
export const PILOT_MAX_CALLS_PER_DAY=4;
export const PILOT_MAX_SPEND_CENTS=100;
// Started A-leg minutes budgeted on top of the B-leg: answer/PIN + ring timeout.
export const PILOT_INBOUND_OVERHEAD_MINUTES=3;
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
  // Exception: capped_caller_id with BOTH CALLER_ID_TRUST_ACCEPTED=true and
  // US_PILOT_ALLOW_CALLER_ID_PROOF=true (owner-accepted spoofing risk).
  // any_caller is only reachable via callerProofMode() with ANY_CALLER_RISK_ACCEPTED=true.
  if(mode!=='dtmf_pin'&&mode!=='any_caller'&&!callerIdPilotOptIn(env))return {ok:false,code:'DTMF_PROOF_REQUIRED'};
  const caps=routingCaps(env,mode);
  if(!caps)return {ok:false,code:'CAPS_NOT_CONFIGURED'};
  if(caps.maxSeconds>PILOT_MAX_SECONDS||caps.maxCallsPerDay>PILOT_MAX_CALLS_PER_DAY||
    caps.maxCentsPerCall>PILOT_MAX_SPEND_CENTS||caps.maxCentsPerDay>PILOT_MAX_SPEND_CENTS)
    return {ok:false,code:'US_PILOT_CAPS_EXCEEDED'};
  // Reserve exposure for BOTH legs (inbound A-leg + onward B-leg).
  // Until provider billing is verified, budget the B-leg's started minutes plus
  // PILOT_INBOUND_OVERHEAD_MINUTES of A-leg (answer/PIN, ring timeout). This is
  // an estimate, NOT a carrier-side hard dollar limit.
  const inboundRate=Number(env.US_PILOT_INBOUND_RATE_CENTS_PER_MIN);
  if(typeof env.US_PILOT_INBOUND_RATE_CENTS_PER_MIN!=='string'||
     !/^\d+(?:\.\d{1,4})?$/.test(env.US_PILOT_INBOUND_RATE_CENTS_PER_MIN)||
     !Number.isFinite(inboundRate)||inboundRate<=0||inboundRate>1000||
     typeof env.US_PILOT_INBOUND_RATE_SOURCE!=='string'||
     !env.US_PILOT_INBOUND_RATE_SOURCE.trim())
    return {ok:false,code:'US_PILOT_INBOUND_RATE_UNVERIFIED'};
  const inboundMaxMinutes=Math.ceil(caps.maxSeconds/60)+PILOT_INBOUND_OVERHEAD_MINUTES;
  const outboundCost=maxCostCents(decision.entry,caps.maxSeconds);
  const inboundCost=Math.ceil(inboundRate*inboundMaxMinutes);
  const maxCost=outboundCost+inboundCost;
  if(maxCost>caps.maxCentsPerCall||maxCost>caps.maxCentsPerDay)
    return {ok:false,code:'SPEND_ESTIMATE_EXCEEDS_CAP'};
  // The source is operator-supplied and NEVER a verified real-time carrier quote.
  const snapshot={
    reservation_id:row.id,account_id:row.account_id,destination:row.destination,
    expires_at:row.expires_at,country:'US',caller_proof:mode,
    // Caller-ID mode: the approval is bound to the exact trusted caller number.
    ...(mode==='capped_caller_id'?{trusted_caller:env.TEST_CALLER_E164,caller_id_spoofable:true}:{}),
    ...(mode==='any_caller'?{trusted_caller:'ANY',any_caller_risk_accepted:true}:{}),
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
