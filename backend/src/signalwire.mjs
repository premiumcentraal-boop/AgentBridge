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
export const SIGNALWIRE_SWML_PATH='/telephony/signalwire/swml';
export const signalWireHangup=()=>({version:'1.0.0',sections:{main:[{hangup:{}}]}});

/** Offline-only draft: never returned from the public webhook. */
export function signalWireConnectPlan(destination,from){
  if(typeof destination!=='string'||!E164.test(destination)||
     typeof from!=='string'||!E164.test(from)||destination===from)
    throw new TypeError('A distinct permitted E.164 destination and verified provider DID are required');
  return {version:'1.0.0',sections:{main:[
    {connect:{to:destination,from,answer_on_bridge:true,timeout:20}},
    {hangup:{}}
  ]}};
}
function validateConnection({space,projectId,apiToken}={}){
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
  const body=await response.text();
  if(body.length>250_000)throw new Error('SignalWire inventory response too large');
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
export async function verifySignalWireSwmlSignature(rawBody,signature,signingKey,configuredUrl,requestUrl){
  if(typeof rawBody!=='string'||new TextEncoder().encode(rawBody).length>MAX_WEBHOOK_BYTES||
     typeof signingKey!=='string'||signingKey.length<16||
     typeof signature!=='string'||!(/^[a-f0-9]{64}$/i.test(signature))||
     typeof configuredUrl!=='string'||configuredUrl!==requestUrl)return false;
  let u;
  try{u=new URL(configuredUrl);}catch{return false;}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!==SIGNALWIRE_SWML_PATH)return false;
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
  if(!env.SIGNALWIRE_SIGNING_KEY||!UUID.test(env.SIGNALWIRE_PROJECT_ID||'')||
     !E164.test(env.US_BRIDGE_DID||'')||!E164.test(env.TEST_CALLER_E164||'')||
     !E164.test(env.TEST_DESTINATION_E164||''))
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
    call.from_number===env.TEST_CALLER_E164&&
    call.from_number!==call.to_number;
  // Never return paid connect instructions until Issue #3 authentication,
  // replay ledger, per-call billing cap and missing-callback recovery exist.
  // An unknown project/caller/DID fails closed; even approved test calls
  // receive only hangup until cryptographic per-call authorization exists.
  if(!allowed)return new Response('Forbidden',{status:403});
  return jsonResponse(signalWireHangup());
}
