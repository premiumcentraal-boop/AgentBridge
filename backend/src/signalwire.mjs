/**
 * SignalWire bring-your-own-project adapter (private preview).
 *
 * API credentials are used only for a read-only project number inventory.
 * SWML webhook requests have a separate project signing key. No paid call
 * action is reachable from the inbound webhook until authorization, live
 * rate caps, and provider event reconciliation have been reviewed.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const E164=/^\+[1-9]\d{7,14}$/;
const SPACE=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_WEBHOOK_BYTES=16_384;
import {logInboundCall} from './inbound-call-log.mjs';
export const SIGNALWIRE_SWML_PATH='/telephony/signalwire/swml';
export const signalWireHangup=()=>({version:'1.0.0',sections:{main:[{hangup:{}}]}});

/** Offline-only draft: never returned from the public webhook. */
export function signalWireConnectPlan(destination,from,{maxDuration,timeout=20}={}){
  if(typeof destination!=='string'||!E164.test(destination)||
     typeof from!=='string'||!E164.test(from)||destination===from)
    throw new TypeError('A distinct permitted E.164 destination and verified provider DID are required');
  if(maxDuration!==undefined&&!(Number.isSafeInteger(maxDuration)&&maxDuration>=1&&maxDuration<=600))
    throw new TypeError('max_duration must be 1..600 seconds');
  if(!(Number.isSafeInteger(timeout)&&timeout>=5&&timeout<=60))throw new TypeError('timeout must be 5..60 seconds');
  // Phone-to-phone bridge only: no record, transcribe, stream or AI methods.
  return {version:'1.0.0',sections:{main:[
    {connect:{to:destination,from,answer_on_bridge:true,timeout,
      ...(maxDuration===undefined?{}:{max_duration:maxDuration})}},
    {hangup:{}}
  ]}};
}
export function validateConnection({space,projectId,apiToken}={}){
  if(typeof space!=='string'||!SPACE.test(space)||
     typeof projectId!=='string'||!UUID.test(projectId)||
     typeof apiToken!=='string'||apiToken.length<10||apiToken.length>512||
     /[\s:]/.test(apiToken))throw new TypeError('Invalid SignalWire project configuration');
}
/** Read-only BYO credential and owned-voice-DID check; no purchase or assignment. */
export async function inspectSignalWireNumbers(config, fetchImpl=fetch){
  validateConnection(config);
  const {space,projectId,apiToken}=config;
  const url='https://'+space+'.signalwire.com/api/relay/rest/phone_numbers?page_size=100';
  const response=await fetchImpl(url,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{authorization:'Basic '+btoa(projectId+':'+apiToken),accept:'application/json'}
  });
  if(!response.ok)throw new Error('SignalWire project number inventory unavailable ('+response.status+')');
  // Bound upstream bytes while streaming: Content-Length is not trustworthy.
  // Never buffer an unbounded carrier response or expose its contents in errors.
  const limit=250_000;
  const advertised=response.headers?.get('content-length');
  if(advertised!==null&&advertised!==undefined&&
     /^\d+$/.test(advertised)&&Number(advertised)>limit){
    // Reject without reading bytes, but also abort the provider stream.
    // Cancellation is best-effort: a failed cancel must not mask the size error.
    try{await response.body?.cancel();}catch{}
    throw new Error('SignalWire inventory response too large');
  }
  if(!response.body?.getReader)throw new Error('Invalid SignalWire inventory response');
  const reader=response.body.getReader();
  const chunks=[];
  let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>limit){
        await reader.cancel().catch(()=>{});
        throw new Error('SignalWire inventory response too large');
      }
      chunks.push(value);
    }
  }catch(error){
    if(error?.message==='SignalWire inventory response too large')throw error;
    throw new Error('Invalid SignalWire inventory response');
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let body;
  try{body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw new Error('Invalid SignalWire inventory response');}
  let payload;
  try{payload=JSON.parse(body);}catch{throw new Error('Invalid SignalWire inventory response');}
  if(!Array.isArray(payload?.data))throw new Error('Invalid SignalWire inventory response');
  const numbers=payload.data.filter(n=>
    n&&typeof n.number==='string'&&E164.test(n.number)&&
    Array.isArray(n.capabilities)&&n.capabilities.includes('voice')
  ).map(n=>({number:n.number,id:n.id,voice:true}));
  return {connected:true,read_only:true,voice_numbers:numbers,has_more:Boolean(payload.links?.next)};
}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function constantTimeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;
}
/** Official SWML signature contract: HMAC SHA256 hex of exact URL + raw body. */
export async function verifySignalWireSwmlSignature(rawBody,signature,signingKey,configuredUrl,requestUrl,expectedPath=SIGNALWIRE_SWML_PATH){
  if(typeof rawBody!=='string'||new TextEncoder().encode(rawBody).length>MAX_WEBHOOK_BYTES||
     typeof signingKey!=='string'||signingKey.length<16||
     typeof signature!=='string'||!(/^[a-f0-9]{64}$/i.test(signature))||
     typeof configuredUrl!=='string'||configuredUrl!==requestUrl)return false;
  let u;
  try{u=new URL(configuredUrl);}catch{return false;}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!==expectedPath)return false;
  const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(signingKey),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(configuredUrl+rawBody)));
  return constantTimeEqual(signature.toLowerCase(),digest);
}
function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store'
  }});
}
/**
 * Accept only signed inbound phone calls from the correct SignalWire project.
 * Even a valid signature authenticates the carrier, NOT the person placing
 * the call: CLI-side caller ID is spoofable. This adapter NEVER connects a leg.
 */
export async function handleSignalWireSwml(request,env={}){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  // TEST_CALLER_E164 may be blank while the owner learns the agent's caller ID:
  // signed calls then still get a clean hangup and are logged for review.
  if(!env.SIGNALWIRE_SIGNING_KEY||!UUID.test(env.SIGNALWIRE_PROJECT_ID||'')||
     !E164.test(env.US_BRIDGE_DID||''))
    return new Response('Not configured',{status:503});
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
    return new Response('Unsupported media type',{status:415});
  if(Number(request.headers.get('content-length')||0)>MAX_WEBHOOK_BYTES)
    return new Response('Payload too large',{status:413});
  // Do not buffer an untrusted, chunked request before enforcing the limit.
  // Content-Length is optional and attacker-controlled; count streamed bytes.
  const reader=request.body?.getReader();
  if(!reader)return new Response('Invalid body',{status:400});
  const chunks=[];
  let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_WEBHOOK_BYTES){
        await reader.cancel();
        return new Response('Payload too large',{status:413});
      }
      chunks.push(value);
    }
  }catch{
    return new Response('Invalid body',{status:400});
  }finally{reader.releaseLock();}
  const combined=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength;}
  let raw;
  try{raw=new TextDecoder('utf-8',{fatal:true}).decode(combined);}
  catch{return new Response('Invalid UTF-8',{status:400});}
  const valid=await verifySignalWireSwmlSignature(raw,
    request.headers.get('x-signalwire-sha256-signature'),
    env.SIGNALWIRE_SIGNING_KEY,env.SIGNALWIRE_SWML_WEBHOOK_URL,request.url);
  if(!valid)return new Response('Forbidden',{status:403});
  let body;
  try{body=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}
  const call=body?.call;
  const allowed=call&&call.project_id===env.SIGNALWIRE_PROJECT_ID&&
    call.direction==='inbound'&&call.type==='phone'&&
    UUID.test(call.call_id||'')&&call.to_number===env.US_BRIDGE_DID&&
    E164.test(call.from_number||'')&&
    call.from_number!==call.to_number;
  // This handler NEVER returns paid connect instructions (flags-off path).
  // A wrong project/DID/type fails closed with 403. A correctly signed call
  // from ANY caller gets a free hangup and is logged (caller ID discovery).
  if(!allowed)return new Response('Forbidden',{status:403});
  const known=E164.test(env.TEST_CALLER_E164||'')&&call.from_number===env.TEST_CALLER_E164;
  await logInboundCall(env,call,'swml_hangup_only',known?'hangup_known_caller':'hangup_unknown_caller');
  return jsonResponse(signalWireHangup());
}
