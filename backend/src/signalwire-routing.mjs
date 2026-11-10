/**
 * Gated SignalWire routing (docs/ROUTING_PLAN.md phases 1, 2 and 5).
 *
 * Reached ONLY when both owner flags are exactly 'true':
 *   PRIVATE_TEST_OUTBOUND_ENABLED and SIGNALWIRE_CONNECT_ENABLED.
 * Otherwise index.mjs keeps using the legacy hangup-only handler unchanged.
 *
 * A `connect` document is returned only when EVERY check passes:
 *  signed request (exact configured URL) -> project/DID/inbound phone match ->
 *  not a replay (provider_events keyed by call_id) -> caller proof (DTMF PIN
 *  or owner-accepted capped caller-ID) -> owner-approved, unexpired, ready
 *  reservation -> allowlisted destination/country, not blocked -> per-call and
 *  per-day spend/call caps -> atomic single claim. Anything else: hangup.
 *
 * Grok Bot stays the only speaking party: no TTS, AI, record, transcribe or
 * stream methods are emitted. Status callbacks are NOT used yet: SignalWire
 * documents signatures for SWML fetches but not for status callbacks (TODO).
 */
import {readBoundedWebhookBody} from './bounded-body.mjs';
import {SIGNALWIRE_SWML_PATH,signalWireHangup,signalWireConnectPlan,verifySignalWireSwmlSignature} from './signalwire.mjs';
import {callerProofMode,verifyPin,MAX_PIN_ATTEMPTS,PIN_DIGITS} from './caller-proof.mjs';
import {routingCaps,utcDayStart,signalWireReservationsConfigured} from './routing-policy.mjs';
import {pilotPolicy,verifyApprovalBinding} from './approval-policy.mjs';

export const SIGNALWIRE_PIN_PATH='/telephony/signalwire/swml/pin';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const E164=/^\+[1-9]\d{7,14}$/;
const MAX_BODY=16_384;
const PIN_WINDOW_SECONDS=60;

export function signalWireRoutingFlagsOn(env={}){
  return env.PRIVATE_TEST_OUTBOUND_ENABLED==='true'&&env.SIGNALWIRE_CONNECT_ENABLED==='true';
}
function swml(doc,status=200){
  return new Response(JSON.stringify(doc),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
const hangup=()=>swml(signalWireHangup());
const text=(body,status)=>new Response(body,{status});
function pinUrl(env){const u=new URL(env.SIGNALWIRE_SWML_WEBHOOK_URL);u.pathname=SIGNALWIRE_PIN_PATH;return u.toString();}
function configured(env){
  return Boolean(env.DB&&E164.test(env.US_BRIDGE_DID||'')&&signalWireReservationsConfigured(env));
}
async function readSigned(request,env,configuredUrl,path){
  if(request.method!=='POST')return {res:text('Method not allowed',405)};
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return {res:text('Unsupported media type',415)};
  const raw=await readBoundedWebhookBody(request,MAX_BODY);
  if(raw===null)return {res:text('Invalid or oversized body',400)};
  const ok=await verifySignalWireSwmlSignature(raw,request.headers.get('x-signalwire-sha256-signature'),
    env.SIGNALWIRE_SIGNING_KEY,configuredUrl,request.url,path);
  if(!ok)return {res:text('Forbidden',403)};
  try{return {body:JSON.parse(raw)};}catch{return {res:text('Invalid JSON',400)};}
}
function callMatches(call,env){
  return call&&call.project_id===env.SIGNALWIRE_PROJECT_ID&&call.direction==='inbound'&&call.type==='phone'&&
    UUID.test(call.call_id||'')&&call.to_number===env.US_BRIDGE_DID&&
    E164.test(call.from_number||'')&&call.from_number!==call.to_number;
}
/** Durable replay guard: one row per (call_id, event_type). Returns false on replay. */
async function recordEvent(env,callId,eventType,now){
  try{
    await env.DB.prepare("INSERT INTO provider_events (provider,provider_call_id,event_type,received_at,outcome) VALUES ('signalwire',?,?,?,'received')")
      .bind(callId,eventType,now).run();
    return true;
  }catch{return false;}
}
async function setOutcome(env,callId,eventType,outcome,reservationId=null){
  await env.DB.prepare("UPDATE provider_events SET outcome=?,reservation_id=? WHERE provider='signalwire' AND provider_call_id=? AND event_type=?")
    .bind(outcome,reservationId,callId,eventType).run();
}
async function findRoutable(env,now){
  return env.DB.prepare("SELECT r.id,r.account_id,r.destination,r.expires_at,r.status,r.pin_sha256,r.pin_attempts FROM reservations r JOIN accounts a ON r.account_id=a.id WHERE a.did=? AND a.status='active' AND r.status='ready' AND r.approved_at IS NOT NULL AND r.expires_at>? ORDER BY r.created_at DESC LIMIT 1")
    .bind(env.US_BRIDGE_DID,now).first();
}
/** Policy + caps; returns {ok, caps, cost, code}. */
async function policyCheck(env,row,mode,now){
  const proposal=pilotPolicy(row,env);
  if(!proposal.ok)return {ok:false,code:proposal.code};
  if(proposal.snapshot.caller_proof!==mode)return {ok:false,code:'CALLER_MODE_CHANGED'};
  // A separate owner token must approve the EXACT current destination,
  // duration, country, rate source and budget; a changed quote is not approved.
  if(!await verifyApprovalBinding(env,row))return {ok:false,code:'APPROVAL_BINDING_MISSING_OR_STALE'};
  const caps=routingCaps(env,mode);
  const cost=proposal.snapshot.estimated_max_cost_cents;
  const usage=await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(max_cost_cents),0) AS c FROM reservations WHERE account_id=? AND claimed_at>=?')
    .bind(row.account_id,utcDayStart(now)).first();
  if(Number(usage?.n||0)+1>caps.maxCallsPerDay)return {ok:false,code:'DAILY_CALL_CAP'};
  if(Number(usage?.c||0)+cost>caps.maxCentsPerDay)return {ok:false,code:'DAILY_SPEND_CAP'};
  return {ok:true,caps,cost};
}
/** Atomic single claim; the one-active-reservation index also blocks concurrent routes. */
async function claim(env,row,callId,check,now){
  const r=await env.DB.prepare("UPDATE reservations SET status='connecting',provider='signalwire',provider_call_id=?,claimed_at=?,max_call_seconds=?,max_cost_cents=? WHERE id=? AND status='ready' AND approved_at IS NOT NULL AND expires_at>?")
    .bind(callId,now,check.caps.maxSeconds,check.cost,row.id,now).run();
  return r.meta?.changes===1;
}
function connectFor(env,row,check){
  return swml(signalWireConnectPlan(row.destination,env.US_BRIDGE_DID,{maxDuration:check.caps.maxSeconds,timeout:30}));
}

/** Initial inbound SWML fetch for the bridge DID. */
export async function handleSignalWireRouting(request,env={}){
  if(!configured(env))return text('Not configured',503);
  const read=await readSigned(request,env,env.SIGNALWIRE_SWML_WEBHOOK_URL,SIGNALWIRE_SWML_PATH);
  if(read.res)return read.res;
  const call=read.body?.call;
  if(!callMatches(call,env))return text('Forbidden',403);
  const mode=callerProofMode(env);
  if(mode==='none')return hangup();
  const now=Math.floor(Date.now()/1000);
  if(!await recordEvent(env,call.call_id,'swml_inbound',now))return hangup();
  const row=await findRoutable(env,now);
  if(!row){await setOutcome(env,call.call_id,'swml_inbound','no_approved_reservation');return hangup();}
  const check=await policyCheck(env,row,mode,now);
  if(!check.ok){await setOutcome(env,call.call_id,'swml_inbound',check.code,row.id);return hangup();}
  if(mode==='capped_caller_id'){
    if(call.from_number!==env.TEST_CALLER_E164){await setOutcome(env,call.call_id,'swml_inbound','CALLER_MISMATCH',row.id);return hangup();}
    if(!await claim(env,row,call.call_id,check,now)){await setOutcome(env,call.call_id,'swml_inbound','CLAIM_LOST',row.id);return hangup();}
    await setOutcome(env,call.call_id,'swml_inbound','connect',row.id);
    return connectFor(env,row,check);
  }
  // dtmf_pin: answer silently, collect digits, post them to the signed PIN URL.
  if(!row.pin_sha256){await setOutcome(env,call.call_id,'swml_inbound','NO_PIN',row.id);return hangup();}
  await setOutcome(env,call.call_id,'swml_inbound','pin_requested',row.id);
  return swml({version:'1.0.0',sections:{main:[
    {answer:{max_duration:check.caps.maxSeconds+PIN_WINDOW_SECONDS}},
    {prompt:{play:'silence:1',max_digits:PIN_DIGITS,terminators:'#',digit_timeout:5,initial_timeout:15}},
    {transfer:{dest:pinUrl(env),params:{digits:'${prompt_value}'}}},
    {hangup:{}}
  ]}});
}

/** Signed follow-up fetch carrying the DTMF digits (dtmf_pin mode only). */
export async function handleSignalWirePin(request,env={}){
  if(!configured(env))return text('Not configured',503);
  if(callerProofMode(env)!=='dtmf_pin')return hangup();
  const read=await readSigned(request,env,pinUrl(env),SIGNALWIRE_PIN_PATH);
  if(read.res)return read.res;
  const call=read.body?.call;
  if(!callMatches(call,env))return text('Forbidden',403);
  const now=Math.floor(Date.now()/1000);
  // A PIN must authenticate the reservation chosen by THIS call's first webhook.
  // Selecting the newest ready reservation here would allow a delayed call from A
  // to consume B after A is cancelled/expired and B becomes ready.
  const started=await env.DB.prepare("SELECT reservation_id FROM provider_events WHERE provider='signalwire' AND provider_call_id=? AND event_type='swml_inbound' AND outcome='pin_requested'")
    .bind(call.call_id).first();
  if(!started?.reservation_id||!UUID.test(started.reservation_id))return hangup();
  if(!await recordEvent(env,call.call_id,'swml_pin',now))return hangup();
  const row=await env.DB.prepare("SELECT r.id,r.account_id,r.destination,r.expires_at,r.status,r.pin_sha256,r.pin_attempts FROM reservations r JOIN accounts a ON r.account_id=a.id WHERE r.id=? AND a.did=? AND a.status='active' AND r.status='ready' AND r.approved_at IS NOT NULL AND r.expires_at>?")
    .bind(started.reservation_id,env.US_BRIDGE_DID,now).first();
  if(!row||!row.pin_sha256){await setOutcome(env,call.call_id,'swml_pin','original_reservation_unavailable',started.reservation_id);return hangup();}
  const bumped=await env.DB.prepare("UPDATE reservations SET pin_attempts=pin_attempts+1 WHERE id=? AND status='ready' AND approved_at IS NOT NULL AND expires_at>? AND pin_attempts<?")
    .bind(row.id,now,MAX_PIN_ATTEMPTS).run();
  if(!bumped.meta?.changes){await setOutcome(env,call.call_id,'swml_pin','PIN_LOCKED',row.id);return hangup();}
  const raw=read.body?.params?.digits??read.body?.vars?.prompt_value;
  const digits=typeof raw==='string'?raw.replace(/#$/,''):'';
  if(!await verifyPin(row.id,digits,row.pin_sha256)){
    await env.DB.prepare("UPDATE reservations SET status='failed',completed_at=? WHERE id=? AND status='ready' AND pin_attempts>=?")
      .bind(now,row.id,MAX_PIN_ATTEMPTS).run();
    await setOutcome(env,call.call_id,'swml_pin','PIN_REJECTED',row.id);
    return hangup();
  }
  const check=await policyCheck(env,row,'dtmf_pin',now);
  if(!check.ok){await setOutcome(env,call.call_id,'swml_pin',check.code,row.id);return hangup();}
  if(!await claim(env,row,call.call_id,check,now)){await setOutcome(env,call.call_id,'swml_pin','CLAIM_LOST',row.id);return hangup();}
  await setOutcome(env,call.call_id,'swml_pin','connect',row.id);
  return connectFor(env,row,check);
}
