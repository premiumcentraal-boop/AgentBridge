/**
 * Chat-first, read-only SignalWire number discovery for one private test project.
 *
 * Account ownership comes from the authenticated D1 row and its configured
 * bridge DID, NOT from a caller-supplied number or a shared project inventory.
 * This module cannot buy, reassign, forward or provision any number.
 */
import {validateConnection} from './signalwire.mjs';
import {readBoundedWebhookBody} from './bounded-body.mjs';

const US_DID=/^\+1[2-9]\d{2}[2-9]\d{6}$/;
const AREA=/^[2-9]\d{2}$/;
const MAX_RESPONSE_BYTES=65_536;

function eligible(account,env){
  return account?.status==='active' && typeof account.id==='string' &&
    US_DID.test(account.did||'') && account.did===env?.US_BRIDGE_DID;
}
function configFrom(env){
  return {space:env?.SIGNALWIRE_SPACE,projectId:env?.SIGNALWIRE_PROJECT_ID,
    apiToken:env?.SIGNALWIRE_API_TOKEN};
}
function validConfig(env){
  try{validateConnection(configFrom(env));return true;}
  catch{return false;}
}
function failure(code,message,status){
  return {status,body:{card_type:'number_error',mode:'preview',code,message,
    purchase_enabled:false,routing_enabled:false}};
}
function unavailable(){
  return failure('PROVIDER_LOOKUP_UNAVAILABLE',
    'SignalWire could not confirm the numbers. Please try again; no changes were made.',503);
}
function guard(account,env){
  return eligible(account,env)?null:failure('BRIDGE_NOT_ASSIGNED',
    'This account has no active, configured US bridge number.',403);
}
function missingCredentials(cardType){
  return {status:200,body:{card_type:cardType,mode:'preview',
    state:'operator_connection_required',provider:'SignalWire',numbers:[],
    purchase_enabled:false,routing_enabled:false,price_verified:false,
    next_step:'An operator must configure scoped SignalWire Numbers credentials on the private server; never paste API tokens into chat.'}};
}

/** No remote API call: a truthful first card that never implies live readiness. */
export function getBridgeSetup(account,env){
  const assigned=eligible(account,env);
  const configured=validConfig(env);
  return {status:200,body:{
    card_type:'bridge_setup',mode:'preview',provider:'SignalWire',
    state:assigned?'assigned_unverified':'not_assigned',
    bridge_number:assigned?account.did:null,
    provider_connection:!assigned?'not_applicable':configured?'server_credentials_configured_unverified':'operator_connection_required',
    number_ownership:'not_checked',
    purchase_enabled:false,routing_enabled:false,price_verified:false,
    native_grok_calling_verified:false,
    next_step:!assigned?'Ask an operator to assign this account a US DID.':
      !configured?'Configure scoped SignalWire Numbers credentials privately on the server.':
        'Use list_my_numbers to check whether the assigned DID appears in this SignalWire project.',
    warning:'Preview only. No carrier changes, live calls or verified prices.'
  }};
}
async function readOnlyProvider(path,query,env,fetchImpl){
  const config=configFrom(env);
  validateConnection(config);
  const url=new URL('https://'+config.space+'.signalwire.com/api/relay/rest/phone_numbers'+path);
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  const response=await fetchImpl(url.toString(),{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{authorization:'Basic '+btoa(config.projectId+':'+config.apiToken),
      accept:'application/json'}
  });
  if(!response?.ok)throw new Error('Provider unavailable');
  const raw=await readBoundedWebhookBody(response,MAX_RESPONSE_BYTES);
  if(raw===null)throw new Error('Provider response too large or invalid');
  let payload;
  try{payload=JSON.parse(raw);}catch{throw new Error('Invalid provider JSON');}
  if(!Array.isArray(payload?.data))throw new Error('Invalid provider number list');
  return payload;
}

/** Only expose the authenticated account's assigned DID, never other project numbers. */
export async function listMyNumbers(account,env,fetchImpl=fetch){
  const denied=guard(account,env);
  if(denied)return denied;
  if(!validConfig(env))return missingCredentials('owned_number');
  let payload;
  try{
    payload=await readOnlyProvider('',{filter_number:account.did,page_size:10},env,fetchImpl);
  }catch{return unavailable();}
  const matching=payload.data.some(n=>n&&n.number===account.did &&
    Array.isArray(n.capabilities)&&n.capabilities.includes('voice'));
  const incomplete=Boolean(payload.links?.next);
  return {status:200,body:{
    card_type:'owned_number',mode:'preview',provider:'SignalWire',
    state:matching?'project_inventory_match':incomplete?'incomplete_inventory':'not_confirmed',
    numbers:matching?[{number:account.did,voice:true,
      ownership:'matched_in_operator_project',routing_enabled:false}]:[],
    purchase_enabled:false,routing_enabled:false,price_verified:false,
    next_step:matching?'The operator must separately verify the customer/provider relationship and secure inbound routing.':
      incomplete?'The provider returned more results; ownership remains unconfirmed.':
        'Check the assigned number and the provider project; no ownership was established.',
    warning:'A matching provider Project inventory entry does not authenticate a Grok Bot call or activate forwarding.'
  }};
}

/** Search only five local voice number candidates; cannot reserve or purchase. */
export async function searchAvailableNumbers(account,{area_code}={},env,fetchImpl=fetch){
  const denied=guard(account,env);
  if(denied)return denied;
  if(typeof area_code!=='string'||!AREA.test(area_code))
    return failure('INVALID_AREA_CODE','Use a three-digit US area code such as 202 or 618.',422);
  if(!validConfig(env))return missingCredentials('number_choices');
  let payload;
  try{
    payload=await readOnlyProvider('/search',
      {areacode:area_code,number_type:'local',max_results:5},env,fetchImpl);
  }catch{return unavailable();}
  const seen=new Set();
  const numbers=[];
  for(const item of payload.data){
    const number=item?.e164;
    if(!US_DID.test(number||'')||number.slice(2,5)!==area_code ||
       !Array.isArray(item.capabilities)||!item.capabilities.includes('voice')||
       seen.has(number))continue;
    seen.add(number);
    numbers.push({number,voice:true,provider:'SignalWire',
      status:'search_candidate_only',price:null,currency:null,purchase_enabled:false});
    if(numbers.length===5)break;
  }
  return {status:200,body:{
    card_type:'number_choices',mode:'preview',provider:'SignalWire',
    area_code,state:numbers.length?'candidates_found':'no_voice_candidates',
    numbers,purchase_enabled:false,routing_enabled:false,price_verified:false,
    next_step:'Number search is read-only. Actual pricing, regulatory eligibility, provider ownership and purchase approval have not been implemented.',
    warning:'Availability may change. These are not owned or reserved numbers; no price or purchase is offered.'
  }};
}
