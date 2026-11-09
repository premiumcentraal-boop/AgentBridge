import {validateMcpEnvelope} from './mcp-validation.mjs';
/**
 * AgentBridge reference backend — intentionally fail-closed.
 * This is NOT a publicly deployable calling reseller: it only routes to one
 * explicitly permitted test destination and has no billing/KYC workflow.
 * Cloudflare Workers + D1; Twilio is a replaceable telecom adapter.
 */
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const E164=/^\+[1-9]\d{7,14}$/;
const MAX_TTL_SECONDS=90;
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
async function parseJson(request){try{if(!(request.headers.get('content-type')||'').includes('application/json'))return null;const body=await request.text();if(body.length>4096)return null;return JSON.parse(body);}catch{return null;}}
export async function prepareReservation(account,requestData,env){
  if(account.status!=='active')return {status:403,body:{error:{code:'ACCOUNT_DISABLED',message:'Account not active'}}};
  if(!validateE164(account.did)||account.did!==env.US_BRIDGE_DID)return {status:503,body:{error:{code:'BRIDGE_NOT_PROVISIONED',message:'Assigned US number is not configured'}}};
  const destination=requestData?.destination;
  if(!validateE164(destination))return {status:422,body:{error:{code:'INVALID_DESTINATION',message:'Enter a valid E.164 international number'}}};
  if(destination===env.US_BRIDGE_DID)return {status:422,body:{error:{code:'INVALID_DESTINATION',message:'Cannot call the access number itself'}}};
  // Deliberately only a consenting, preapproved test number until billing,
  // anti-fraud and country-by-country regulatory approval are complete.
  if(destination!==env.TEST_DESTINATION_E164)return {status:403,body:{error:{code:'TEST_DESTINATION_ONLY',message:'Prototype permits only the configured test destination'}}};
  const key=requestData?.idempotency_key;
  if(typeof key!=='string'||!/^[A-Za-z0-9_.:-]{8,96}$/.test(key))return {status:422,body:{error:{code:'INVALID_IDEMPOTENCY_KEY',message:'Supply a unique 8–96 character request key'}}};
  const now=Math.floor(Date.now()/1000);
  await env.DB.prepare("UPDATE reservations SET status='expired' WHERE account_id=? AND status='ready' AND expires_at < ?").bind(account.id,now).run();
  const existing=await env.DB.prepare('SELECT id,destination,status,expires_at FROM reservations WHERE account_id=? AND idempotency_key=?').bind(account.id,key).first();
  if(existing){if(existing.destination!==destination)return {status:409,body:{error:{code:'IDEMPOTENCY_CONFLICT',message:'Idempotency key used for a different destination'}}};return {status:200,body:reservationView(existing,account.did)};}
  const active=await env.DB.prepare("SELECT id FROM reservations WHERE account_id=? AND status IN ('ready','connecting') LIMIT 1").bind(account.id).first();
  if(active)return {status:409,body:{error:{code:'BRIDGE_BUSY',message:'An active or unresolved call is already reserved'}}};
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM reservations WHERE account_id=? AND created_at >= ?').bind(account.id,now-3600).first();
  if(Number(count?.n||0)>=10)return {status:429,body:{error:{code:'RATE_LIMIT',message:'Prototype hourly request limit reached'}}};
  const id=crypto.randomUUID();
  try{await env.DB.prepare("INSERT INTO reservations (id,account_id,destination,idempotency_key,status,created_at,expires_at) VALUES (?,?,?,?, 'ready',?,?)").bind(id,account.id,destination,key,now,now+MAX_TTL_SECONDS).run();}
  catch{return {status:409,body:{error:{code:'BRIDGE_BUSY',message:'A reservation is already active. Retry after it is closed'}}};}
  return {status:201,body:reservationView({id,destination,status:'ready',expires_at:now+MAX_TTL_SECONDS},account.did)};
}
function reservationView(item,did){return {id:item.id,destination:item.destination,us_access_number:did,status:item.status,expires_at:new Date(item.expires_at*1000).toISOString(),max_call_seconds:MAX_CALL_SECONDS,warning:'Verify destination and obtain user approval before Grok Bot places its native US call. Prototype only; no live quote or billing.'};}
async function getReservation(account,id,env){const row=await env.DB.prepare('SELECT id,destination,status,expires_at FROM reservations WHERE id=? AND account_id=?').bind(id,account.id).first();return row?json(reservationView(row,account.did)):error('NOT_FOUND','Reservation not found',404);}
async function cancelReservation(account,id,env){const change=await env.DB.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND account_id=? AND status='ready'").bind(id,account.id).run();return change.meta?.changes?json({id,status:'cancelled'}):error('CANNOT_CANCEL','Reservation does not exist or is no longer ready',409);}
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
async function incoming(request,env){
  if(!requireEnv(env))return twiml(hangupXml());
  const raw=await request.text();if(raw.length>16000||!await verifyTwilioSignature(request,raw,env.TWILIO_AUTH_TOKEN,env.PUBLIC_BASE_URL))return new Response('Forbidden',{status:403});
  const fields=new URLSearchParams(raw);
  const to=fields.get('To'),sid=fields.get('CallSid'),from=fields.get('From');
  // A reservation alone must never make the DID an open forwarder. Reject
  // unknown caller IDs BEFORE reading or consuming a reservation.
  if(to!==env.US_BRIDGE_DID||!approvedTestCaller(from,env)||!/^CA[a-f0-9]{32}$/i.test(sid||''))return twiml(hangupXml());
  const now=Math.floor(Date.now()/1000);
  const row=await env.DB.prepare("SELECT r.id,r.destination FROM reservations r JOIN accounts a ON r.account_id=a.id WHERE a.did=? AND a.status='active' AND r.status='ready' AND r.expires_at>=? ORDER BY r.created_at DESC LIMIT 1").bind(to,now).first();
  if(!row||row.destination!==env.TEST_DESTINATION_E164)return twiml(hangupXml());
  // Atomically consume route: no second inbound call may reuse it.
  const done=await env.DB.prepare("UPDATE reservations SET status='connecting',call_sid=? WHERE id=? AND status='ready' AND expires_at>=?").bind(sid,row.id,now).run();
  if(!done.meta?.changes)return twiml(hangupXml());
  const base=new URL(env.PUBLIC_BASE_URL);
  const callback=base.origin+'/telephony/twilio/dial-complete';
  return twiml(dialXml(row.destination,callback));
}
async function dialComplete(request,env){
  if(!requireEnv(env))return new Response('Not configured',{status:503});
  const raw=await request.text();if(raw.length>16000||!await verifyTwilioSignature(request,raw,env.TWILIO_AUTH_TOKEN,env.PUBLIC_BASE_URL))return new Response('Forbidden',{status:403});
  const body=new URLSearchParams(raw);
  const sid=body.get('CallSid')||'',state=body.get('DialCallStatus')||'';
  if(!sid)return twiml(hangupXml());
  const final=state==='completed'?'completed':'failed';
  await env.DB.prepare("UPDATE reservations SET status=?,completed_at=? WHERE call_sid=? AND status='connecting'").bind(final,Math.floor(Date.now()/1000),sid).run();
  return twiml(hangupXml());
}
async function routeRest(request,url,env,account){
  if(url.pathname==='/v1/reservations'&&request.method==='POST'){const input=await parseJson(request);if(!input)return error('INVALID_JSON','Expected a small JSON request');const r=await prepareReservation(account,input,env);return json(r.body,r.status);}
  const match=url.pathname.match(/^\/v1\/reservations\/([a-f0-9-]{36})(\/cancel)?$/i);
  if(match&&request.method==='GET'&&!match[2])return getReservation(account,match[1],env);
  if(match&&request.method==='POST'&&match[2])return cancelReservation(account,match[1],env);
  return error('NOT_FOUND','Route not found',404);
}
const TOOLS=[{name:'prepare_international_call',description:'Reserve a short-lived US bridge for a preapproved test international destination. No call is placed by this tool.',inputSchema:{type:'object',properties:{destination:{type:'string',description:'International E.164 destination including +'},idempotency_key:{type:'string',description:'Unique key for safe retries'}},required:['destination','idempotency_key'],additionalProperties:false}},{name:'get_call_status',description:'Read the state of an existing reservation.',inputSchema:{type:'object',properties:{reservation_id:{type:'string'}},required:['reservation_id'],additionalProperties:false}},{name:'cancel_international_call',description:'Cancel an unused ready reservation.',inputSchema:{type:'object',properties:{reservation_id:{type:'string'}},required:['reservation_id'],additionalProperties:false}}];
async function handleMcp(request,account,env){
  const rpc=await parseJson(request);
  if(!rpc)return error('INVALID_JSON','Expected a small JSON object',400);
  const validation=validateMcpEnvelope(rpc);
  if(!validation.ok)return json({jsonrpc:'2.0',id:(typeof rpc.id==='string'||typeof rpc.id==='number')?rpc.id:null,error:{code:validation.code,message:validation.message}},400);
  if(validation.notification)return new Response(null,{status:202});
  const response=(result)=>json({jsonrpc:'2.0',id:rpc.id??null,result});
  const fault=(code,message)=>json({jsonrpc:'2.0',id:rpc.id??null,error:{code,message}});
  if(rpc.method==='initialize')return response({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'AgentBridge',version:'0.1.0'}});
  if(rpc.method==='ping')return response({});
  if(rpc.method==='tools/list')return response({tools:TOOLS});
  if(rpc.method==='tools/call'){
    const name=rpc.params?.name,args=rpc.params?.arguments||{};let result;
    if(name==='prepare_international_call')result=await prepareReservation(account,args,env);
    else if(name==='get_call_status'){if(!/^[a-f0-9-]{36}$/i.test(args.reservation_id||''))result={status:422,body:{error:'Invalid reservation ID'}};else {const row=await env.DB.prepare('SELECT id,destination,status,expires_at FROM reservations WHERE id=? AND account_id=?').bind(args.reservation_id,account.id).first();result={status:row?200:404,body:row?reservationView(row,account.did):{error:'Not found'}};}}
    else if(name==='cancel_international_call'){if(!/^[a-f0-9-]{36}$/i.test(args.reservation_id||''))result={status:422,body:{error:'Invalid reservation ID'}};else {const r=await env.DB.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND account_id=? AND status='ready'").bind(args.reservation_id,account.id).run();result={status:r.meta?.changes?200:409,body:r.meta?.changes?{status:'cancelled'}:{error:'Not ready or not found'}};}}
    else return fault(-32601,'Unknown tool');
    return response({content:[{type:'text',text:JSON.stringify(result.body)}],isError:result.status>=400});
  }
  return fault(-32601,'Method not found');
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return json({service:'agentbridge',mode:'prototype',configured:requireEnv(env)});
  if(url.pathname.startsWith('/telephony/twilio/')){
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    if(url.pathname==='/telephony/twilio/incoming')return incoming(request,env);
    if(url.pathname==='/telephony/twilio/dial-complete')return dialComplete(request,env);
    return new Response('Not found',{status:404});
  }
  if(!requireEnv(env))return error('NOT_CONFIGURED','Bridge backend is not configured',503);
  if(!['/mcp','/v1/reservations'].includes(url.pathname)&&!url.pathname.startsWith('/v1/reservations/'))return error('NOT_FOUND','Route not found',404);
  const account=await findAccount(request,env);
  if(!account)return error('UNAUTHORIZED','A valid scoped bearer token is required',401);
  try{if(url.pathname==='/mcp')return request.method==='POST'?handleMcp(request,account,env):error('METHOD_NOT_ALLOWED','POST required',405);return await routeRest(request,url,env,account)}
  catch(e){console.error('agentbridge request failure',String(e));return error('INTERNAL_ERROR','Request could not be completed',500);}
}};
