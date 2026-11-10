import {validateMcpEnvelope} from './mcp-validation.mjs';
import {SIGNALWIRE_SWML_PATH,handleSignalWireSwml} from './signalwire.mjs';
import {readBoundedWebhookBody} from './bounded-body.mjs';
import {getBridgeSetup,listMyNumbers,searchAvailableNumbers} from './chat-number-tools.mjs';
import {NUMBER_CARD_URI,numberCardResource,readNumberCardResource} from './chat-card.mjs';
import {blockedReason,destinationDecision,reservationTtlSeconds,maxCostCents,routingCaps,signalWireReservationsConfigured} from './routing-policy.mjs';
import {callerProofMode,generatePin,pinHash} from './caller-proof.mjs';
import {SIGNALWIRE_PIN_PATH,signalWireRoutingFlagsOn,handleSignalWireRouting,handleSignalWirePin} from './signalwire-routing.mjs';
import {pilotPolicy,policyFingerprint} from './approval-policy.mjs';
import {fetchCarrierReconciliation} from './carrier-reconciliation.mjs';
/**
 * AgentBridge reference backend — intentionally fail-closed.
 * This is NOT a publicly deployable calling reseller: it only routes to one
 * explicitly permitted test destination and has no billing/KYC workflow.
 * Cloudflare Workers + D1; Twilio is a replaceable telecom adapter.
 */
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const E164=/^\+[1-9]\d{7,14}$/;
const MAX_CALL_SECONDS=180;

export function validateE164(value){return typeof value==='string'&&E164.test(value);}
export function escapeXml(value){return String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
export function hangupXml(){return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';}
export function dialXml(destination,actionUrl,seconds=MAX_CALL_SECONDS){
  if(!validateE164(destination))throw new Error('invalid destination');
  if(!/^https:\/\//.test(actionUrl))throw new Error('invalid callback URL');
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeLimit="'+Math.max(1,Math.min(MAX_CALL_SECONDS,seconds))+'" answerOnBridge="true" action="'+escapeXml(actionUrl)+'" method="POST"><Number>'+escapeXml(destination)+'</Number></Dial></Response>';
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function twiml(body){return new Response(body,{status:200,headers:{'content-type':'application/xml; charset=utf-8','cache-control':'no-store'}});}
function error(code,message,status=400){return json({error:{code,message}},status);}
function requireMcpEnv(env){return Boolean(env.DB&&validateE164(env.US_BRIDGE_DID));}
/** Reservation REST/MCP needs either the legacy Twilio config or a SignalWire-only config. Neither enables routing by itself. */
function reservationApiReady(env){return Boolean(env.DB&&validateE164(env.US_BRIDGE_DID)&&(requireEnv(env)||signalWireReservationsConfigured(env)));}
function requireEnv(env){return Boolean(env.DB&&env.PUBLIC_BASE_URL?.startsWith('https://')&&validateE164(env.US_BRIDGE_DID)&&validateE164(env.TEST_DESTINATION_E164)&&validateE164(env.TEST_CALLER_E164)&&env.TWILIO_AUTH_TOKEN);}
function rawHex(bytes){return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function sha256(text){return rawHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function hmacBase64(secret,message){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)));return btoa(String.fromCharCode(...sig));}
/** Twilio's classic x-twilio-signature canonicalization for form-encoded POST. */
export async function verifyTwilioSignature(request,rawBody,authToken,publicBaseUrl){
  const signature=request.headers.get('x-twilio-signature');if(!signature||!authToken)return false;
  const url=new URL(request.url);const base=new URL(publicBaseUrl);
  const canonical=base.origin+url.pathname+url.search;
  const form=new URLSearchParams(rawBody);
  const keys=[...new Set([...form.keys()])].sort();
  const signed=canonical+keys.map(k=>k+form.getAll(k).join('')).join('');
  return safeEqual(signature,await hmacBase64(authToken,signed));
}
async function findAccount(request,env){
  const authorization=request.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return null;
  const token=authorization.slice(7).trim();
  if(token.length<32||token.length>256)return null;
  const digest=await sha256(token);
  return env.DB.prepare('SELECT id, did, status FROM accounts WHERE api_key_sha256 = ?').bind(digest).first();
}
async function parseJson(request){
  // Authentication precedes parsing. Never buffer an untrusted MCP/REST body
  // without a byte limit; a declared Content-Length is not authoritative.
  if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))return null;
  try{
    const body=await readBoundedWebhookBody(request,4096);
    if(body===null)return null;
    const data=JSON.parse(body);
    return data;
  }catch{return null;}
}
export async function prepareReservation(account,requestData,env){
  if(account.status!=='active')return {status:403,body:{error:{code:'ACCOUNT_DISABLED',message:'Account not active'}}};
  if(!validateE164(account.did)||account.did!==env.US_BRIDGE_DID)return {status:503,body:{error:{code:'BRIDGE_NOT_PROVISIONED',message:'Assigned US number is not configured'}}};
  const destination=requestData?.destination;
  if(!validateE164(destination))return {status:422,body:{error:{code:'INVALID_DESTINATION',message:'Enter a valid E.164 international number'}}};
  if(destination===env.US_BRIDGE_DID)return {status:422,body:{error:{code:'INVALID_DESTINATION',message:'Cannot call the access number itself'}}};
  // Deliberately only a consenting, preapproved test number until billing,
  // anti-fraud and country-by-country regulatory approval are complete.
  if(blockedReason(destination,env))return {status:403,body:{error:{code:'DESTINATION_BLOCKED',message:'Emergency, premium, special-service and non-allowlisted ranges cannot be reserved'}}};
  const swRouting=signalWireReservationsConfigured(env);
  const policy=swRouting?destinationDecision(destination,env):null;
  if(!(policy?.ok||destination===env.TEST_DESTINATION_E164))return {status:403,body:{error:{code:'TEST_DESTINATION_ONLY',message:'Prototype permits only owner-allowlisted test destinations'}}};
  const key=requestData?.idempotency_key;
  if(typeof key!=='string'||!/^[A-Za-z0-9_.:-]{8,96}$/.test(key))return {status:422,body:{error:{code:'INVALID_IDEMPOTENCY_KEY',message:'Supply a unique 8–96 character request key'}}};
  const now=Math.floor(Date.now()/1000);
  await env.DB.prepare("UPDATE reservations SET status='expired' WHERE account_id=? AND status='ready' AND expires_at <= ?").bind(account.id,now).run();
  const existing=await env.DB.prepare('SELECT id,destination,status,expires_at FROM reservations WHERE account_id=? AND idempotency_key=?').bind(account.id,key).first();
  if(existing){if(existing.destination!==destination)return {status:409,body:{error:{code:'IDEMPOTENCY_CONFLICT',message:'Idempotency key used for a different destination'}}};const terminal={id:existing.id,status:existing.status==='ready'&&existing.expires_at<=now?'expired':existing.status,expires_at:new Date(existing.expires_at*1000).toISOString(),us_access_number:null,retry:'new_idempotency_key_required'};if(terminal.status==='expired')return {status:409,body:{error:{code:'RESERVATION_EXPIRED',message:'Reservation expired. Use a new idempotency key.'},reservation:terminal}};if(existing.status!=='ready')return {status:409,body:{error:{code:'RESERVATION_NOT_READY',message:'This reservation was consumed or closed. Use a new idempotency key.'},reservation:terminal}};return {status:200,body:reservationView(existing,account.did,now)};}
  const active=await env.DB.prepare("SELECT id FROM reservations WHERE account_id=? AND status IN ('ready','connecting') LIMIT 1").bind(account.id).first();
  if(active)return {status:409,body:{error:{code:'BRIDGE_BUSY',message:'An active or unresolved call is already reserved'}}};
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM reservations WHERE account_id=? AND created_at >= ?').bind(account.id,now-3600).first();
  if(Number(count?.n||0)>=10)return {status:429,body:{error:{code:'RATE_LIMIT',message:'Prototype hourly request limit reached'}}};
  const id=crypto.randomUUID();
  const ttl=reservationTtlSeconds(env);
  // Validate the complete pilot policy before inserting any ready reservation.
  const proposal=swRouting&&policy?.ok?pilotPolicy({id,account_id:account.id,destination,status:'ready',expires_at:now+ttl},env):null;
  if(proposal&&!proposal.ok)return {status:409,body:{error:{code:'US_PILOT_NOT_READY',message:'US trial configuration is incomplete: '+proposal.code}}};
  const mode=swRouting&&policy?.ok?callerProofMode(env):'none';
  const pin=mode==='dtmf_pin'?generatePin():null;
  try{
    if(swRouting&&policy?.ok)await env.DB.prepare("INSERT INTO reservations (id,account_id,destination,idempotency_key,status,created_at,expires_at,pin_sha256) VALUES (?,?,?,?, 'ready',?,?,?)").bind(id,account.id,destination,key,now,now+ttl,pin?await pinHash(id,pin):null).run();
    else await env.DB.prepare("INSERT INTO reservations (id,account_id,destination,idempotency_key,status,created_at,expires_at) VALUES (?,?,?,?, 'ready',?,?)").bind(id,account.id,destination,key,now,now+ttl).run();
  }
  catch{return {status:409,body:{error:{code:'BRIDGE_BUSY',message:'A reservation is already active. Retry after it is closed'}}};}
  const body=reservationView({id,destination,status:'ready',expires_at:now+ttl},account.did,now);
  if(swRouting&&policy?.ok){
    body.owner_approval_required=true;
    body.caller_proof=mode;
    body.max_call_seconds=proposal.snapshot.max_call_seconds;
    body.estimate={rate_cents_per_min:policy.entry.rate_cents_per_min,
      rate_source:policy.entry.rate_source,
      inbound_rate_cents_per_min:proposal.snapshot.inbound_rate_cents_per_min,
      inbound_rate_source:proposal.snapshot.inbound_rate_source,
      inbound_estimated_max_minutes:proposal.snapshot.inbound_estimated_max_minutes,
      max_call_seconds:proposal.snapshot.max_call_seconds,
      max_cost_cents:proposal.snapshot.estimated_max_cost_cents,price_verified:false};
    if(pin){body.dtmf_pin=pin;body.dtmf_instructions='After the call connects, send these 8 digits followed by #. Shown once; single use.';}
    body.warning='Not routable until the owner approves it out-of-band. Routing also requires both owner flags. Estimate uses the owner-recorded rate, not a live quote.';
  }
  return {status:201,body};
}
function reservationView(item,did,now=Math.floor(Date.now()/1000)){const status=item.status==='ready'&&item.expires_at<=now?'expired':item.status;return {id:item.id,destination:item.destination,us_access_number:status==='ready'?did:null,status,expires_at:new Date(item.expires_at*1000).toISOString(),max_call_seconds:MAX_CALL_SECONDS,warning:status==='ready'?'Verify destination and obtain user approval before Grok Bot places its native US call. Prototype only; no live quote or billing.':'This reservation cannot be used to place a call. Create a new reservation with a new idempotency key.'};}
async function getReservation(account,id,env){const row=await env.DB.prepare('SELECT id,destination,status,expires_at FROM reservations WHERE id=? AND account_id=?').bind(id,account.id).first();return row?json(reservationView(row,account.did)):error('NOT_FOUND','Reservation not found',404);}
async function cancelReservation(account,id,env){const change=await env.DB.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND account_id=? AND status='ready' AND expires_at> ?").bind(id,account.id,Math.floor(Date.now()/1000)).run();return change.meta?.changes?json({id,status:'cancelled'}):error('CANNOT_CANCEL','Reservation does not exist or is no longer ready',409);}
/**
 * Private-test inbound gate. Caller ID is a weak, spoofable signal, so this
 * is an additional deny-by-default guard, NOT production authentication.
 * Public service requires a carrier-verified origin / per-call challenge.
 */
export function approvedTestCaller(from, env) {
  return validateE164(env?.TEST_CALLER_E164) &&
    validateE164(from) &&
    from === env.TEST_CALLER_E164 &&
    from !== env.US_BRIDGE_DID;
}
/**
 * Twilio is a legacy reference transport and NOT part of the US SignalWire pilot.
 * The shared SignalWire flag must never activate a second, unmetered provider.
 * Signed requests are accepted only to return safe Hangup; this code cannot Dial.
 */
async function incoming(request,env){
  if(!requireEnv(env))return twiml(hangupXml());
  const raw=await readBoundedWebhookBody(request);
  if(raw===null||!await verifyTwilioSignature(request,raw,env.TWILIO_AUTH_TOKEN,env.PUBLIC_BASE_URL))
    return new Response('Forbidden',{status:403});
  const fields=new URLSearchParams(raw);
  if(['To','From','CallSid'].some(field=>fields.getAll(field).length!==1))
    return twiml(hangupXml());
  // Retain strict identity checks for audit/compatibility, never claim a route.
  if(fields.get('To')!==env.US_BRIDGE_DID||!approvedTestCaller(fields.get('From'),env)||
     !/^CA[a-f0-9]{32}$/i.test(fields.get('CallSid')||''))return twiml(hangupXml());
  return twiml(hangupXml());
}
async function dialComplete(request,env){
  if(!requireEnv(env))return new Response('Not configured',{status:503});
  const raw=await readBoundedWebhookBody(request);if(raw===null||!await verifyTwilioSignature(request,raw,env.TWILIO_AUTH_TOKEN,env.PUBLIC_BASE_URL))return new Response('Forbidden',{status:403});
  const body=new URLSearchParams(raw);
  // Unknown or ambiguous callbacks are NOT evidence that the carrier leg ended.
  // Retain the connecting lock until a confirmed terminal outcome arrives.
  if(body.getAll('CallSid').length!==1||body.getAll('DialCallStatus').length!==1)return twiml(hangupXml());
  const sid=body.get('CallSid'),state=body.get('DialCallStatus');
  if(!/^CA[a-f0-9]{32}$/i.test(sid||''))return twiml(hangupXml());
  const terminalStates={completed:'completed',busy:'failed',failed:'failed','no-answer':'failed',canceled:'failed'};
  if(!Object.hasOwn(terminalStates,state))return twiml(hangupXml());
  const final=terminalStates[state];
  await env.DB.prepare("UPDATE reservations SET status=?,completed_at=? WHERE call_sid=? AND status='connecting'").bind(final,Math.floor(Date.now()/1000),sid).run();
  return twiml(hangupXml());
}
const OWNER_HASH=/^[a-f0-9]{64}$/;
/**
 * Owner-only, out-of-band approval (two-step). Authenticated with a separate
 * owner token whose SHA-256 is OWNER_APPROVAL_TOKEN_SHA256. The account/MCP
 * bearer token used by the chat agent can never approve its own reservation.
 */
async function ownerRoute(request,url,env){
  // Owner token never goes to the chat/MCP connector. GET review is separate
  // from POST approval; both demand the exact independently held owner token.
  if(!env.DB||!OWNER_HASH.test(env.OWNER_APPROVAL_TOKEN_SHA256||''))
    return error('NOT_CONFIGURED','Owner approval is not configured',503);
  const m=url.pathname.match(/^\/v1\/owner\/reservations\/([a-f0-9-]{36})\/(review|approve|mark-ended)$/i);
  if(!m)return error('NOT_FOUND','Route not found',404);
  const action=m[2];
  if(request.method!==(action==='review'?'GET':'POST'))
    return error('METHOD_NOT_ALLOWED',action==='review'?'GET required':'POST required',405);
  const auth=request.headers.get('authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
  if(token.length<32||token.length>256||
     !safeEqual(await sha256(token),env.OWNER_APPROVAL_TOKEN_SHA256))
    return error('UNAUTHORIZED','Owner approval token required',401);
  const now=Math.floor(Date.now()/1000);
  if(action==='mark-ended'){
    // Carrier Voice Logs identify SWML segment IDs (not the stable call_id).
    // Never unlock a connecting reservation based only on an operator click.
    const row=await env.DB.prepare("SELECT r.id,r.account_id,r.destination,r.status,r.created_at,r.max_cost_cents,r.provider_call_id,l.provider_segment_id FROM reservations r JOIN reservation_carrier_legs l ON l.reservation_id=r.id WHERE r.id=? AND r.provider='signalwire' AND r.status='connecting'")
      .bind(m[1]).first();
    if(!row)return error('CANNOT_MARK_ENDED','No active SignalWire reservation with a carrier segment',409);
    const checked=await fetchCarrierReconciliation(row,env);
    if(!checked.ok)return error('CARRIER_RECONCILIATION_REQUIRED',
      'Carrier has not yet confirmed both call legs and charges: '+checked.code,409);
    // Verify first; then record carrier charge before releasing the active lock.
    await env.DB.prepare('UPDATE reservation_carrier_legs SET reconciled_at=?,actual_cost_cents=? WHERE reservation_id=?')
      .bind(now,checked.actual_cost_cents,row.id).run();
    const ended=await env.DB.prepare("UPDATE reservations SET status='completed',completed_at=? WHERE id=? AND provider='signalwire' AND status='connecting'")
      .bind(now,row.id).run();
    if(ended.meta?.changes!==1)return error('CANNOT_MARK_ENDED','Reservation state changed during reconciliation',409);
    return json({id:row.id,status:'completed',carrier_confirmed:true,
      actual_cost_cents:checked.actual_cost_cents,
      warning:'Charges are from the retrieved carrier records; independently confirm the statement before further calls.'});
  }
  const row=await env.DB.prepare('SELECT id,account_id,destination,status,expires_at,approved_at FROM reservations WHERE id=?')
    .bind(m[1]).first();
  if(!row||row.status!=='ready'||row.expires_at<=now||row.approved_at!==null)
    return error('CANNOT_APPROVE','Reservation is expired, consumed, absent or already approved',409);
  const decision=pilotPolicy(row,env);
  if(!decision.ok)return error('PILOT_POLICY_BLOCKED',
    'US-only destination, caller verification or cost/duration caps are missing: '+decision.code,409);
  const proposal_digest=await policyFingerprint(decision.snapshot);
  if(action==='review')return json({proposal:decision.snapshot,proposal_digest,
    explicit_owner_approval_required:true,
    warning:'Configured rate is NOT a live carrier quote. Verify destination, pricing, actual provider limits and both-leg costs out-of-band.'});
  const input=await parseJson(request);
  if(!input||typeof input.proposal_digest!=='string'||
     !/^[a-f0-9]{64}$/.test(input.proposal_digest)||
     Object.keys(input).some(k=>k!=='proposal_digest'))
    return error('INVALID_APPROVAL','Approve requires the digest from an owner-only GET review',422);
  if(!safeEqual(input.proposal_digest,proposal_digest))
    return error('PROPOSAL_CHANGED','The destination, rate, caps or expiry changed. Review again.',409);
  try{
    await env.DB.prepare('INSERT INTO reservation_approval_bindings (reservation_id,policy_sha256,approved_at) VALUES (?,?,?)')
      .bind(row.id,proposal_digest,now).run();
    // Atomic row predicate protects against cancellation/expiry racing approval.
    const approved=await env.DB.prepare("UPDATE reservations SET approved_at=? WHERE id=? AND status='ready' AND approved_at IS NULL AND expires_at>?")
      .bind(now,row.id,now).run();
    if(approved.meta?.changes!==1)return error('CANNOT_APPROVE','Reservation changed while approving. It remains unroutable.',409);
  }catch{
    return error('APPROVAL_STORAGE_UNAVAILABLE',
      'Approval could not be stored safely. Apply migration 0002 or inspect a conflicting review.',503);
  }
  return json({id:row.id,status:'ready',owner_approved:true,proposal_digest});
}
async function routeRest(request,url,env,account){
  if(url.pathname==='/v1/reservations'&&request.method==='POST'){const input=await parseJson(request);if(!input)return error('INVALID_JSON','Expected a small JSON request');const r=await prepareReservation(account,input,env);return json(r.body,r.status);}
  const match=url.pathname.match(/^\/v1\/reservations\/([a-f0-9-]{36})(\/cancel)?$/i);
  if(match&&request.method==='GET'&&!match[2])return getReservation(account,match[1],env);
  if(match&&request.method==='POST'&&match[2])return cancelReservation(account,match[1],env);
  return error('NOT_FOUND','Route not found',404);
}
const CHAT_NUMBER_TOOLS=[
  {name:'get_bridge_setup',title:'My AgentBridge setup',description:'Preview assigned US bridge number and next setup step. No provider request, payment or call.',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'list_my_numbers',title:'My US bridge number',description:'Check whether the account-assigned voice DID appears in the private SignalWire Project. Does not expose other project numbers.',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'search_available_numbers',title:'Find US number candidates',description:'Read-only search for at most five local voice numbers by area code. No prices, holds or purchases.',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},inputSchema:{type:'object',properties:{area_code:{type:'string',pattern:'^[2-9][0-9]{2}$',description:'Three-digit US area code, such as 202 or 618'}},required:['area_code'],additionalProperties:false}}
];
const NUMBER_CARD_TOOLS=CHAT_NUMBER_TOOLS.map(tool=>({...tool,_meta:{ui:{resourceUri:NUMBER_CARD_URI,visibility:['model','app']}}}));
const TOOLS=[...NUMBER_CARD_TOOLS,{name:'prepare_international_call',description:'Reserve a short-lived US bridge for a preapproved test international destination. No call is placed by this tool.',inputSchema:{type:'object',properties:{destination:{type:'string',description:'International E.164 destination including +'},idempotency_key:{type:'string',description:'Unique key for safe retries'}},required:['destination','idempotency_key'],additionalProperties:false}},{name:'get_call_status',description:'Read the state of an existing reservation.',inputSchema:{type:'object',properties:{reservation_id:{type:'string'}},required:['reservation_id'],additionalProperties:false}},{name:'cancel_international_call',description:'Cancel an unused ready reservation.',inputSchema:{type:'object',properties:{reservation_id:{type:'string'}},required:['reservation_id'],additionalProperties:false}}];
async function handleMcp(request,account,env){
  const rpc=await parseJson(request);
  if(!rpc)return error('INVALID_JSON','Expected a small JSON object',400);
  const validation=validateMcpEnvelope(rpc);
  if(!validation.ok)return json({jsonrpc:'2.0',id:(typeof rpc.id==='string'||typeof rpc.id==='number')?rpc.id:null,error:{code:validation.code,message:validation.message}},400);
  if(validation.notification)return new Response(null,{status:202});
  const response=(result)=>json({jsonrpc:'2.0',id:rpc.id??null,result});
  const fault=(code,message)=>json({jsonrpc:'2.0',id:rpc.id??null,error:{code,message}});
  if(rpc.method==='initialize')return response({protocolVersion:'2025-03-26',capabilities:{tools:{},resources:{}},serverInfo:{name:'AgentBridge',version:'0.1.0'}});
  if(rpc.method==='ping')return response({});
  if(rpc.method==='tools/list')return response({tools:reservationApiReady(env)?TOOLS:NUMBER_CARD_TOOLS});
  if(rpc.method==='resources/list')return response({resources:[numberCardResource()]});
  if(rpc.method==='resources/read')return response(readNumberCardResource(rpc.params.uri));
  if(rpc.method==='tools/call'){
    const name=rpc.params?.name,args=rpc.params?.arguments||{};let result;
    if(name==='get_bridge_setup')result=getBridgeSetup(account,env);
    else if(name==='list_my_numbers')result=await listMyNumbers(account,env);
    else if(name==='search_available_numbers')result=await searchAvailableNumbers(account,args,env);
    else if(!reservationApiReady(env))result={status:503,body:{error:{code:'NOT_CONFIGURED',message:'Calling is not configured; read-only tools remain available.'}}};
    else if(name==='prepare_international_call')result=await prepareReservation(account,args,env);
    else if(name==='get_call_status'){if(!/^[a-f0-9-]{36}$/i.test(args.reservation_id||''))result={status:422,body:{error:'Invalid reservation ID'}};else {const row=await env.DB.prepare('SELECT id,destination,status,expires_at FROM reservations WHERE id=? AND account_id=?').bind(args.reservation_id,account.id).first();result={status:row?200:404,body:row?reservationView(row,account.did):{error:'Not found'}};}}
    else if(name==='cancel_international_call'){if(!/^[a-f0-9-]{36}$/i.test(args.reservation_id||''))result={status:422,body:{error:'Invalid reservation ID'}};else {const r=await env.DB.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND account_id=? AND status='ready' AND expires_at> ?").bind(args.reservation_id,account.id,Math.floor(Date.now()/1000)).run();result={status:r.meta?.changes?200:409,body:r.meta?.changes?{status:'cancelled'}:{error:'Not ready or not found'}};}}
    else return fault(-32601,'Unknown tool');
    const output={content:[{type:'text',text:JSON.stringify(result.body)}],isError:result.status>=400};
    // Hosts supporting structured results can render cards; text is a complete fallback.
    if(CHAT_NUMBER_TOOLS.some(tool=>tool.name===name)&&result.status<400)output.structuredContent=result.body;
    return response(output);
  }
  return fault(-32601,'Method not found');
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return json({service:'agentbridge',mode:'prototype',configured:requireEnv(env)});
  // Signed SignalWire SWML requests are hangup-only; this cannot place paid calls.
  // Both owner flags exactly 'true' -> fully gated router; otherwise the legacy hangup-only handler, unchanged.
  if(url.pathname===SIGNALWIRE_SWML_PATH)return signalWireRoutingFlagsOn(env)?handleSignalWireRouting(request,env):handleSignalWireSwml(request,env);
  if(url.pathname===SIGNALWIRE_PIN_PATH&&signalWireRoutingFlagsOn(env))return handleSignalWirePin(request,env);
  if(url.pathname.startsWith('/telephony/twilio/')){
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    if(url.pathname==='/telephony/twilio/incoming')return incoming(request,env);
    if(url.pathname==='/telephony/twilio/dial-complete')return dialComplete(request,env);
    return new Response('Not found',{status:404});
  }
  if(url.pathname.startsWith('/v1/owner/'))return ownerRoute(request,url,env);
  if((url.pathname==='/mcp'&&!requireMcpEnv(env))||
     (url.pathname!=='/mcp'&&!reservationApiReady(env)))return error('NOT_CONFIGURED','Bridge backend is not configured',503);
  if(!['/mcp','/v1/reservations'].includes(url.pathname)&&!url.pathname.startsWith('/v1/reservations/'))return error('NOT_FOUND','Route not found',404);
  const account=await findAccount(request,env);
  if(!account)return error('UNAUTHORIZED','A valid scoped bearer token is required',401);
  try{if(url.pathname==='/mcp')return request.method==='POST'?handleMcp(request,account,env):error('METHOD_NOT_ALLOWED','POST required',405);return await routeRest(request,url,env,account)}
  catch(e){console.error('agentbridge request failure',String(e));return error('INTERNAL_ERROR','Request could not be completed',500);}
}};
