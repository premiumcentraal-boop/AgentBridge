/**
 * Read-only SignalWire Voice Logs reconciliation.
 * A SWML call_id identifies the call; voice logs are keyed by segment_id.
 * We require terminal inbound + single child outbound segments, no pagination,
 * coherent E.164 participants and finite carrier charges before unlocking D1.
 *
 * Voice Logs endpoint: GET /api/voice/logs/:segment_id plus list to find
 * parent_id; neither endpoint places a call or changes provider settings.
 */
import {validateConnection} from './signalwire.mjs';
import {readBoundedWebhookBody} from './bounded-body.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_RESPONSE=65_536;
const MAX_LIST_RESPONSE=256*1024;
function failed(code){return {ok:false,code};}
function safeMoney(value){
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1000;
}
export async function fetchCarrierReconciliation(row,env,fetchImpl=fetch){
  if(!row||!UUID.test(row.provider_segment_id||'')||
     !UUID.test(row.provider_call_id||'')||!Number.isSafeInteger(row.created_at)||
     !Number.isSafeInteger(row.max_cost_cents))
    return failed('MISSING_CARRIER_IDENTIFIERS');
  const config={space:env.SIGNALWIRE_SPACE,projectId:env.SIGNALWIRE_PROJECT_ID,
    apiToken:env.SIGNALWIRE_VOICE_API_TOKEN};
  try{validateConnection(config);}catch{return failed('VOICE_LOG_CREDENTIALS_REQUIRED');}
  const prefix='https://'+config.space+'.signalwire.com/api/voice/logs';
  const headers={authorization:'Basic '+btoa(config.projectId+':'+config.apiToken),accept:'application/json'};
  const get=async(url,max=MAX_RESPONSE)=>{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',headers,
      signal:AbortSignal.timeout(8000)});
    if(!response?.ok)return null;
    const raw=await readBoundedWebhookBody(response,max);
    if(raw===null)return null;
    try{return JSON.parse(raw);}catch{return null;}
  };
  let inbound,listing;
  try{
    inbound=await get(prefix+'/'+row.provider_segment_id);
    const q=new URL(prefix);
    q.searchParams.set('created_after',new Date((row.created_at-120)*1000).toISOString());
    q.searchParams.set('page_size','1000');
    listing=await get(q.toString(),MAX_LIST_RESPONSE);
  }catch{return failed('CARRIER_LOOKUP_UNAVAILABLE');}
  if(!inbound||!listing||!Array.isArray(listing.data)||listing.links?.next)
    return failed('INCOMPLETE_CARRIER_LOGS');
  if(inbound.id!==row.provider_segment_id||
     inbound.status!=='completed'||inbound.direction!=='inbound'||
     inbound.to!==env.US_BRIDGE_DID||!safeMoney(inbound.charge))
    return failed('INBOUND_CARRIER_NOT_TERMINAL');
  const children=listing.data.filter(x=>x?.parent_id===inbound.id);
  // Exactly one outbound leg is expected in this one-destination trial.
  // Multiple children might be additional billable legs: manual review required.
  if(children.length!==1)return failed('UNVERIFIED_OUTBOUND_LEGS');
  const child=children[0];
  if(child.direction!=='outbound'||child.to!==row.destination||
     child.status!=='completed'||!safeMoney(child.charge))
    return failed('OUTBOUND_CARRIER_NOT_TERMINAL');
  const total=Math.ceil((inbound.charge+child.charge)*100);
  if(total>row.max_cost_cents)return failed('ACTUAL_CHARGE_EXCEEDS_RESERVED_CAP');
  return {ok:true,inbound_segment_id:inbound.id,outbound_segment_id:child.id,
    actual_cost_cents:total,source:'verified_project_voice_logs',terminal:true};
}
