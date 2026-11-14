/**
 * Read-only SignalWire Voice Logs reconciliation.
 * A SWML call_id identifies the call; voice logs are keyed by segment_id.
 * We require terminal inbound + single child outbound segments, no pagination,
 * coherent E.164 participants and finite carrier charges before unlocking D1.
 *
 * Endpoints (SignalWire REST "Voice Logs", read-only):
 *   GET https://{space}.signalwire.com/api/voice/logs/{id}
 *   GET https://{space}.signalwire.com/api/voice/logs?created_after=...&page_size=1000
 * Documented log fields used here (docs: /docs/apis/rest/voice-logs/list-voice-logs):
 *   id (uuid), from, to, direction (inbound|outbound|outbound-api|outbound-dial),
 *   status (queued|initiated|ringing|in-progress|busy|failed|no-answer|canceled|
 *   completed|ended|answered|created|ending|joined), charge (double, dollars),
 *   parent_id (nullable), and list pagination links.next (absent on last page).
 * Neither endpoint places a call or changes provider settings.
 *
 * Any missing, unexpected or contradictory field keeps the reservation LOCKED;
 * the owner-only force-unlock route is the documented escape hatch. This
 * function never throws.
 */
import {validateConnection} from './signalwire.mjs';
import {readBoundedWebhookBody} from './bounded-body.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_RESPONSE=65_536;
const MAX_LIST_RESPONSE=256*1024;
// Only states SignalWire documents as final. 'ending'/'in-progress' etc. stay locked.
export const INBOUND_TERMINAL=new Set(['completed','ended']);
export const OUTBOUND_TERMINAL=new Set(['completed','ended','busy','failed','no-answer','canceled']);
export const OUTBOUND_DIRECTIONS=new Set(['outbound','outbound-dial','outbound-api']);
function failed(code){return {ok:false,code};}
function safeMoney(value){
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1000;
}
function isObj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
// Exact decimal arithmetic for the finite, nonnegative provider dollar values.
// Number.toString() gives the shortest round-trippable decimal, including exponents.
function decimalCents(value){
  const match=/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if(!match)throw Error('invalid carrier charge');
  const digits=BigInt(match[1]+(match[2]||''));
  const scale=(match[2]||'').length-Number(match[3]||0);
  return scale>0
    ? [digits*100n,10n**BigInt(scale)]
    : [digits*100n*10n**BigInt(-scale),1n];
}
function ceilCarrierCents(a,b){
  const [an,ad]=decimalCents(a),[bn,bd]=decimalCents(b);
  const numerator=an*bd+bn*ad,denominator=ad*bd;
  return Number((numerator+denominator-1n)/denominator);
}

export async function fetchCarrierReconciliation(row,env,fetchImpl=fetch){
  try{return await reconcile(row,env,fetchImpl);}
  catch{return failed('RECONCILIATION_ERROR');}
}
async function reconcile(row,env,fetchImpl){
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
  const q=new URL(prefix);
  let inbound,listing;
  try{
    inbound=await get(prefix+'/'+row.provider_segment_id);
    q.searchParams.set('created_after',new Date((row.created_at-120)*1000).toISOString());
    q.searchParams.set('page_size','1000');
    listing=await get(q.toString(),MAX_LIST_RESPONSE);
  }catch{return failed('CARRIER_LOOKUP_UNAVAILABLE');}
  if(!isObj(inbound)||!isObj(listing)||!Array.isArray(listing.data))
    return failed('INCOMPLETE_CARRIER_LOGS');
  if(!isObj(listing.links)||typeof listing.links.self!=='string'||!listing.links.self||
     typeof listing.links.first!=='string'||!listing.links.first)
    return failed('INCOMPLETE_CARRIER_PAGINATION');
  // A short response is not proof of a complete first page when its own
  // pagination links identify a different origin, endpoint or page. Never
  // trust an arbitrary metadata URL as evidence of a complete call ledger.
  const isFirstPageLink=value=>{
    try{
      const url=new URL(value);
      if(url.protocol!=='https:'||url.origin!==new URL(prefix).origin||
         url.pathname!==new URL(prefix).pathname||url.username||url.password||url.hash)
        return false;
      // Unknown query filters/cursors can silently narrow the provider ledger.
      // Only the exact request filters and optional first-page marker are safe.
      for(const key of url.searchParams.keys()){
        if(key!=='page_number'&&key!=='page_size'&&key!=='created_after')return false;
      }
      const pages=url.searchParams.getAll('page_number');
      // A link with the right origin/path but a different query window or page
      // size cannot attest to completeness of the requested first page.
      const sizes=url.searchParams.getAll('page_size');
      const starts=url.searchParams.getAll('created_after');
      return pages.length<=1&&(pages.length===0||pages[0]==='0')&&
        sizes.length<=1&&(sizes.length===0||sizes[0]==='1000')&&
        starts.length<=1&&(starts.length===0||starts[0]===q.searchParams.get('created_after'));
    }catch{return false;}
  };
  if(!isFirstPageLink(listing.links.self)||!isFirstPageLink(listing.links.first))
    return failed('INCOMPLETE_CARRIER_PAGINATION');
  // Optional reverse/terminal navigation metadata must not contradict the
  // single first-and-last page claim. Never follow these untrusted URLs.
  if(listing.links.prev!==null&&listing.links.prev!==undefined)
    return failed('INCOMPLETE_CARRIER_PAGINATION');
  if(listing.links.last!==null&&listing.links.last!==undefined&&
     (!isFirstPageLink(listing.links.last)||
      new URL(listing.links.last).searchParams.get('page_number')!==
      new URL(listing.links.self).searchParams.get('page_number')))
    return failed('INCOMPLETE_CARRIER_PAGINATION');
  if(listing.links.next!==null&&listing.links.next!==undefined)
    return failed('PAGINATED_CARRIER_LOGS');
  // A full page without a next cursor cannot prove the provider did not truncate
  // the response at its advertised page_size. Never unlock from that ambiguity.
  if(listing.data.length>=1000)return failed('INCOMPLETE_CARRIER_PAGINATION');
  // Never infer a complete carrier ledger from malformed entries or repeated
  // segment identifiers: either could conceal another billable outbound leg.
  const ids=new Set();
  for(const entry of listing.data){
    if(!isObj(entry)||typeof entry.id!=='string'||!UUID.test(entry.id)||
       (entry.parent_id!==null&&entry.parent_id!==undefined&&
        (typeof entry.parent_id!=='string'||!UUID.test(entry.parent_id)))||
       ids.has(entry.id.toLowerCase()))
      return failed('AMBIGUOUS_CARRIER_LOG_ENTRIES');
    // UUID identifiers are case-insensitive; mixed-case duplicates must not
    // masquerade as distinct provider segments in the billing ledger.
    ids.add(entry.id.toLowerCase());
  }
  // A valid-looking parent UUID that is absent from the returned ledger is
  // not proof of an unrelated call. The omitted ancestor may conceal another
  // billable leg, so never release a reservation from an orphaned call graph.
  for(const entry of listing.data){
    if(entry.parent_id!==null&&entry.parent_id!==undefined&&
       !ids.has(entry.parent_id.toLowerCase()))
      return failed('ORPHANED_CARRIER_LOG_PARENT');
  }
  // The detail endpoint and list endpoint are independent reads. If the list
  // includes the inbound segment, contradictory terminal state or charges must
  // never be treated as verified evidence for releasing a reservation.
  const sameUuid=(a,b)=>typeof a==='string'&&typeof b==='string'&&UUID.test(a)&&UUID.test(b)&&a.toLowerCase()===b.toLowerCase();
  const listedInbound=listing.data.find(x=>sameUuid(x.id,inbound.id));
  // The list is the only evidence used to count all legs. If it omits the
  // inbound segment, we cannot establish that the query covers this call.
  // Never release a lock using a list that might be incomplete or stale.
  if(!listedInbound)return failed('INBOUND_MISSING_FROM_CARRIER_LIST');
  if(
    listedInbound.direction!==inbound.direction||
    listedInbound.from!==inbound.from||
    listedInbound.to!==inbound.to||
    listedInbound.status!==inbound.status||
    listedInbound.charge!==inbound.charge||
    listedInbound.parent_id!==inbound.parent_id)
    return failed('CONFLICTING_INBOUND_CARRIER_LOGS');
  if(!sameUuid(inbound.id,row.provider_segment_id))return failed('INBOUND_LOG_MISMATCH');
  // A root inbound segment must not itself be a child of another billable leg.
  if(inbound.parent_id!==null&&inbound.parent_id!==undefined)
    return failed('INBOUND_LOG_MISMATCH');
  if(inbound.direction!=='inbound'||inbound.to!==env.US_BRIDGE_DID)
    return failed('INBOUND_LOG_MISMATCH');
  if(!INBOUND_TERMINAL.has(inbound.status))return failed('INBOUND_CARRIER_NOT_TERMINAL');
  if(!safeMoney(inbound.charge))return failed('INBOUND_CHARGE_UNKNOWN');
  const children=listing.data.filter(x=>isObj(x)&&sameUuid(x.parent_id,inbound.id));
  // Exactly one outbound leg is expected in this one-destination trial.
  // Multiple children might be additional billable legs: manual review required.
  if(children.length!==1)return failed('UNVERIFIED_OUTBOUND_LEGS');
  const child=children[0];
  if(!UUID.test(child.id||'')||sameUuid(child.id,inbound.id)||
     !OUTBOUND_DIRECTIONS.has(child.direction)||child.from!==env.US_BRIDGE_DID||
     child.to!==row.destination)
    return failed('OUTBOUND_LOG_MISMATCH');
  // A terminal direct B-leg does not prove there were no downstream billable
  // legs. Any listed child of that B-leg makes the two-leg ledger incomplete.
  if(listing.data.some(entry=>sameUuid(entry.parent_id,child.id)))
    return failed('UNVERIFIED_NESTED_OUTBOUND_LEGS');
  if(!OUTBOUND_TERMINAL.has(child.status))return failed('OUTBOUND_CARRIER_NOT_TERMINAL');
  if(!safeMoney(child.charge))return failed('OUTBOUND_CHARGE_UNKNOWN');
  // Convert each provider charge's decimal representation to an exact rational
  // number of cents. Binary float addition or rounding to four decimal places
  // can undercount a positive fraction of a cent at a cap boundary.
  const total=ceilCarrierCents(inbound.charge,child.charge);
  if(total>row.max_cost_cents)return failed('ACTUAL_CHARGE_EXCEEDS_RESERVED_CAP');
  return {ok:true,inbound_segment_id:inbound.id,outbound_segment_id:child.id,
    outbound_status:child.status,actual_cost_cents:total,
    source:'verified_project_voice_logs',terminal:true};
}
