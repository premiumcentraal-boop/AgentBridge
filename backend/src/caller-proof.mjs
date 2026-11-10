/**
 * Caller-proof options for issue #3. Caller ID alone is spoofable.
 *
 *  - 'dtmf_pin': a one-time numeric PIN bound to ONE reservation, short TTL
 *    (the reservation's), single use, attempt-limited, compared in constant
 *    time against SHA-256(reservation_id ":" pin). Only the hash is stored.
 *  - 'capped_caller_id': trusts TEST_CALLER_E164 ONLY when the owner has set
 *    CALLER_ID_TRUST_ACCEPTED='true', and forces tighter ceilings.
 *  - 'any_caller': accepts ANY caller during an owner-approved reservation;
 *    only with ANY_CALLER_RISK_ACCEPTED='true' (owner-accepted risk).
 *  - anything else (default): no caller proof, so no routing.
 */
export const PIN_DIGITS=8;
export const MAX_PIN_ATTEMPTS=3;
export const CALLER_ID_MODE_MAX_SECONDS=120;
export const CALLER_ID_MODE_MAX_CALLS_PER_DAY=3;
const E164=/^\+[1-9]\d{7,14}$/;

/**
 * Second, US-pilot-specific owner opt-in that makes capped_caller_id routable
 * in the pilot (e.g. for an AI voice agent that cannot send DTMF). Caller ID
 * is still spoofable: this is an accepted residual risk, not authentication.
 */
export function callerIdPilotOptIn(env={}){
  return env.US_PILOT_ALLOW_CALLER_ID_PROOF==='true'&&callerProofMode(env)==='capped_caller_id';
}
export function callerProofMode(env={}){
  if(env.CALLER_PROOF_MODE==='dtmf_pin')return 'dtmf_pin';
  // 'any_caller': NO caller proof at all. For an owner AI agent whose outbound
  // caller ID rotates per call. Needs the explicit ANY_CALLER_RISK_ACCEPTED
  // opt-in; the only protection left is the owner-approved, short-lived,
  // single-use reservation plus destination/duration/spend caps.
  if(env.CALLER_PROOF_MODE==='any_caller'&&env.ANY_CALLER_RISK_ACCEPTED==='true')return 'any_caller';
  if(env.CALLER_PROOF_MODE==='capped_caller_id'&&env.CALLER_ID_TRUST_ACCEPTED==='true'&&
     E164.test(env.TEST_CALLER_E164||'')&&env.TEST_CALLER_E164!==env.US_BRIDGE_DID)return 'capped_caller_id';
  return 'none';
}
/** Uniform 8-digit PIN using rejection sampling (no modulo bias). */
export function generatePin(){
  const out=[];
  const buf=new Uint8Array(16);
  while(out.length<PIN_DIGITS){
    crypto.getRandomValues(buf);
    for(const b of buf){if(b<250&&out.length<PIN_DIGITS)out.push(b%10);}
  }
  return out.join('');
}
export async function pinHash(reservationId,pin){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(reservationId)+':'+String(pin)));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function constantTimeEqualHex(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
/** Validate shape first, then constant-time compare of hashes. */
export async function verifyPin(reservationId,submitted,storedHash){
  if(typeof submitted!=='string'||!new RegExp('^\\d{'+PIN_DIGITS+'}$').test(submitted))return false;
  if(typeof storedHash!=='string'||!/^[a-f0-9]{64}$/.test(storedHash))return false;
  return constantTimeEqualHex(await pinHash(reservationId,submitted),storedHash);
}
