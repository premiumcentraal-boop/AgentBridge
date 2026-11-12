/**
 * AgentBridge private, single-operator stdio MCP server (read-only).
 *
 * Reuses the backend's existing number-management code. It exposes ONLY
 * read-only tools. It never imports the hosted Worker (backend/src/index.mjs),
 * so reservation, Twilio/SWML routing, connect plans and D1 writes are not
 * reachable. It contains no language model: the chat host is the only AI.
 *
 * Credentials come only from environment variables and are never logged,
 * printed or returned. All outward text passes through redact().
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {getBridgeSetup,listMyNumbers,searchNumberCandidates} from '../../backend/src/chat-number-tools.mjs';
import {inspectSignalWireNumbers,validateConnection} from '../../backend/src/signalwire.mjs';
import {NUMBER_CARD_URI,NUMBER_CARD_MIME,numberCardResource,readNumberCardResource} from '../../backend/src/chat-card.mjs';
import {previewChatCallFlow} from '../../backend/src/chat-experience.mjs';

export const SERVER_NAME='agentbridge-local';
export const SERVER_VERSION='1.1.0';
/** Exact env var names read by this server. */
export const ENV_NAMES=Object.freeze({
  space:'SIGNALWIRE_SPACE',projectId:'SIGNALWIRE_PROJECT_ID',
  apiToken:'SIGNALWIRE_API_TOKEN',bridgeDid:'US_BRIDGE_DID'
});
/** The complete allowlist. Anything else must never be registered. */
export const READ_ONLY_TOOLS=Object.freeze([
  'get_bridge_setup','list_my_numbers','list_project_numbers','search_available_numbers','preview_chat_call_flow'
]);
/** Known write/paid/routing capabilities in this repo; asserted absent. */
export const FORBIDDEN_TOOLS=Object.freeze([
  'prepare_international_call','get_call_status','cancel_international_call',
  'purchase_number','buy_number','reserve_number','update_number','assign_number',
  'place_call','make_call','dial','connect_call','send_message','send_sms',
  'enable_forwarding','set_forwarding','configure_webhook'
]);
const US_DID=/^\+1[2-9]\d{2}[2-9]\d{6}$/;
const LOCAL_ACCOUNT_ID='local-operator';

function configFrom(env){
  return {space:env[ENV_NAMES.space],projectId:env[ENV_NAMES.projectId],apiToken:env[ENV_NAMES.apiToken]};
}
function credentialsValid(env){
  try{validateConnection(configFrom(env));return true;}catch{return false;}
}
function presence(value){return typeof value==='string'&&value.length>0?'set':'missing';}

/** Remove any credential value (and its Basic-auth encoding) from outgoing text. */
export function redact(text,env){
  let out=String(text);
  const token=env[ENV_NAMES.apiToken];
  const project=env[ENV_NAMES.projectId];
  const secrets=[];
  if(typeof token==='string'&&token.length>=4){
    secrets.push(token);
    if(typeof project==='string'){
      try{secrets.push(btoa(project+':'+token));}catch{}
    }
  }
  for(const s of secrets)out=out.split(s).join('[redacted]');
  return out;
}

/** The single operator of this private server is treated as an active account bound to US_BRIDGE_DID. */
function localAccount(env){
  const did=env[ENV_NAMES.bridgeDid];
  return {id:LOCAL_ACCOUNT_ID,did:typeof did==='string'?did:'',status:'active'};
}

function summarize(body){
  const lines=[];
  const flags='Read-only preview: purchase_enabled=false, routing_enabled=false, price_verified=false.';
  switch(body?.card_type){
    case 'bridge_setup':{
      const c=body.local_server?.credentials||{};
      lines.push('AgentBridge setup (local stdio server, read-only)');
      lines.push('Bridge number: '+(body.bridge_number||'not assigned (US_BRIDGE_DID unset or invalid)'));
      lines.push('SignalWire credentials: '+Object.entries(c).map(([k,v])=>k+'='+v).join(', '));
      lines.push('Credential format valid: '+(body.local_server?.credentials_format_valid?'yes':'no')+' (not verified with SignalWire; use list_project_numbers to test).');
      lines.push('Provider connection: '+body.provider_connection+'; number ownership: '+body.number_ownership);
      break;
    }
    case 'owned_number':
      if(body.state==='operator_connection_required'){lines.push('Assigned-number check unavailable.');break;}
      lines.push('Assigned-number check: '+body.state);
      for(const n of body.numbers||[])lines.push('- '+n.number+' (voice, '+n.ownership+')');
      if(!(body.numbers||[]).length)lines.push('No matching voice number returned.');
      break;
    case 'project_inventory':
      if(body.state==='operator_connection_required'){lines.push('Project inventory unavailable.');break;}
      lines.push('SignalWire project voice numbers: '+body.numbers.length+(body.has_more?' (first page only; more exist)':''));
      for(const n of body.numbers)lines.push('- '+n.number);
      if(!body.numbers.length)lines.push('No voice-capable numbers on the first page.');
      break;
    case 'number_choices':
      if(body.state==='operator_connection_required'){lines.push('US number search unavailable.');break;}
      lines.push('US local voice number candidates for area code '+body.area_code+': '+(body.numbers||[]).length);
      for(const n of body.numbers||[])lines.push('- '+n.number+' (candidate only, not reserved, price unknown)');
      break;
    case 'number_error':
      lines.push('Error '+body.code+': '+body.message);
      break;
    case 'call_experience_preview':
      lines.push(body.title+' (no calling capability)');
      lines.push('Suggested chat request: '+body.sample_message);
      for(const step of body.steps||[])lines.push('- '+step);
      lines.push('Mandatory safety checks and separate approvals apply in every difficulty mode.');
      lines.push('Preference is not stored; platform permission and native Grok Bot compatibility are not verified.');
      break;
    default:
      lines.push('AgentBridge result');
  }
  if(body?.state==='operator_connection_required')
    lines.push('Not configured: set '+ENV_NAMES.space+', '+ENV_NAMES.projectId+' and '+ENV_NAMES.apiToken+' privately in the server environment. Never paste tokens into chat.');
  if(body?.next_step)lines.push('Next step: '+body.next_step);
  if(body?.warning)lines.push('Note: '+body.warning);
  lines.push(flags);
  return lines.join('\n');
}

/** Text summary + JSON text (for card fallback) + structuredContent on success. */
function toToolResult({status,body},env){
  const safeBody=JSON.parse(redact(JSON.stringify(body),env));
  const result={content:[
    {type:'text',text:redact(summarize(safeBody),env)},
    {type:'text',text:JSON.stringify(safeBody)}
  ],isError:status>=400};
  if(status<400)result.structuredContent=safeBody;
  return result;
}

function setupStatus(env){
  const base=getBridgeSetup(localAccount(env),env).body;
  const configured=credentialsValid(env);
  return {status:200,body:{...base,
    provider_connection:base.provider_connection==='not_applicable'
      ?(configured?'server_credentials_configured_unverified':'operator_connection_required')
      :base.provider_connection,
    local_server:{
      transport:'stdio',name:SERVER_NAME,version:SERVER_VERSION,read_only:true,
      credentials:{
        [ENV_NAMES.space]:presence(env[ENV_NAMES.space]),
        [ENV_NAMES.projectId]:presence(env[ENV_NAMES.projectId]),
        [ENV_NAMES.apiToken]:presence(env[ENV_NAMES.apiToken]),
        [ENV_NAMES.bridgeDid]:US_DID.test(env[ENV_NAMES.bridgeDid]||'')?'set':presence(env[ENV_NAMES.bridgeDid])==='set'?'invalid':'missing'
      },
      credentials_format_valid:configured,
      tools:[...READ_ONLY_TOOLS]
    }
  }};
}

function notConfigured(cardType){
  return {status:200,body:{card_type:cardType,mode:'preview',provider:'SignalWire',
    state:'operator_connection_required',numbers:[],
    purchase_enabled:false,routing_enabled:false,price_verified:false,
    next_step:'Configure scoped SignalWire Numbers credentials privately in the local server environment.'}};
}

async function projectInventory(env,fetchImpl){
  if(!credentialsValid(env))return notConfigured('project_inventory');
  try{
    const r=await inspectSignalWireNumbers(configFrom(env),fetchImpl);
    return {status:200,body:{card_type:'project_inventory',mode:'preview',provider:'SignalWire',
      state:r.voice_numbers.length?'voice_numbers_found':'no_voice_numbers',
      numbers:r.voice_numbers.map(n=>({number:n.number,voice:true,routing_enabled:false})),
      has_more:r.has_more,purchase_enabled:false,routing_enabled:false,price_verified:false,
      next_step:r.has_more?'Only the first 100 numbers were read; inventory is incomplete.':'Inventory is read-only; nothing was changed.',
      warning:'Numbers listed in the Project are not enabled for AgentBridge routing.'}};
  }catch(e){
    const code=/\((\d{3})\)/.exec(String(e?.message))?.[1];
    return {status:503,body:{card_type:'number_error',mode:'preview',code:'PROVIDER_LOOKUP_UNAVAILABLE',
      message:'SignalWire inventory could not be read'+(code?' (HTTP '+code+')':'')+'. Check Space, Project ID, token scope and network. No changes were made.',
      purchase_enabled:false,routing_enabled:false}};
  }
}

const CARD_META={ui:{resourceUri:NUMBER_CARD_URI,visibility:['model','app']},'ui/resourceUri':NUMBER_CARD_URI};
const RO={readOnlyHint:true,destructiveHint:false,idempotentHint:true};

/**
 * Build the server. env and fetchImpl are injectable for tests; production
 * uses process.env and the global fetch (looked up per call).
 */
export function createServer({env=process.env,fetchImpl=(...a)=>globalThis.fetch(...a)}={}){
  const server=new McpServer({name:SERVER_NAME,version:SERVER_VERSION},
    {instructions:'Private read-only AgentBridge number tools. No purchases, calls, messages or forwarding are possible through this server.'});
  const registered=[];
  const tool=(name,config,cb)=>{
    if(!READ_ONLY_TOOLS.includes(name)||FORBIDDEN_TOOLS.includes(name))
      throw new Error('Refusing to register non-allowlisted tool: '+name);
    if(config.annotations?.readOnlyHint!==true)throw new Error('Tool must be read-only: '+name);
    registered.push(name);
    server.registerTool(name,config,async(args)=>{
      try{return toToolResult(await cb(args??{}),env);}
      catch{return toToolResult({status:500,body:{card_type:'number_error',mode:'preview',code:'INTERNAL_ERROR',
        message:'The read-only lookup failed; no changes were made.',purchase_enabled:false,routing_enabled:false}},env);}
    });
  };

  tool('get_bridge_setup',{title:'AgentBridge setup status',
    description:'Show which SignalWire settings are configured (set/missing only, never values), the assigned US bridge number and the next setup step. Makes no provider request.',
    inputSchema:{},annotations:RO,_meta:CARD_META},
    async()=>setupStatus(env));

  tool('preview_chat_call_flow',{title:'Choose AgentBridge chat guidance',
    description:'Preview Simple, Guided or Advanced calling instructions within chat. Never saves a preference, prepares a call, checks eligibility or overrides owner approval, PIN or carrier caps.',
    inputSchema:{difficulty:z.enum(['simple','guided','advanced']).optional()},
    annotations:RO},
    async(args)=>previewChatCallFlow(args));

  tool('list_my_numbers',{title:'Check my US bridge number',
    description:'Check whether the configured US_BRIDGE_DID appears as a voice-capable number in the SignalWire Project. One read-only GET.',
    inputSchema:{},annotations:{...RO,openWorldHint:true},_meta:CARD_META},
    async()=>listMyNumbers(localAccount(env),env,fetchImpl));

  tool('list_project_numbers',{title:'SignalWire number inventory',
    description:'List voice-capable phone numbers owned by the configured SignalWire Project (first page, up to 100). One read-only GET; no changes.',
    inputSchema:{},annotations:{...RO,openWorldHint:true}},
    async()=>projectInventory(env,fetchImpl));

  tool('search_available_numbers',{title:'Find US number candidates',
    description:'Read-only search for up to five available US local voice numbers by three-digit area code. No prices, holds or purchases.',
    inputSchema:{area_code:z.string().regex(/^[2-9][0-9]{2}$/).describe('Three-digit US area code, such as 202 or 618')},
    annotations:{...RO,idempotentHint:false,openWorldHint:true},_meta:CARD_META},
    async(args)=>searchNumberCandidates(args,env,fetchImpl));

  const res=numberCardResource();
  server.registerResource(res.name,NUMBER_CARD_URI,
    {title:res.name,description:res.description,mimeType:NUMBER_CARD_MIME,_meta:res._meta},
    async(uri)=>readNumberCardResource(uri.href));

  const extra=registered.filter(n=>!READ_ONLY_TOOLS.includes(n));
  if(extra.length||registered.length!==READ_ONLY_TOOLS.length)throw new Error('Tool registry mismatch');
  return {server,registeredTools:Object.freeze([...registered])};
}
