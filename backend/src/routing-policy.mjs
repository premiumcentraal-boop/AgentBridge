/**
 * Destination, country and spend/time policy for private test routing
 * (docs/ROUTING_PLAN.md phase 2). Pure functions; all limits are owner
 * configuration. Missing or invalid configuration means "do not route".
 */
import {CALLER_ID_MODE_MAX_SECONDS,CALLER_ID_MODE_MAX_CALLS_PER_DAY} from './caller-proof.mjs';

export const HARD_MAX_CALL_SECONDS=180;
const E164=/^\+[1-9]\d{7,14}$/;
const US_NUMBER=/^\+1([2-9]\d{2})([2-9]\d{2})\d{4}$/;
/** ISO country -> calling code. Unknown countries are rejected (extend deliberately). */
export const COUNTRY_CODES=Object.freeze({
  US:'1',GB:'44',NL:'31',BE:'32',FR:'33',ES:'34',IT:'39',IE:'353',PT:'351',CH:'41',AT:'43',
  DE:'49',DK:'45',SE:'46',NO:'47',PL:'48',PH:'63',IN:'91',MX:'52',BR:'55',AU:'61',
  NZ:'64',JP:'81',ZA:'27',NG:'234',KE:'254'
});
/** International premium, shared-cost, satellite and global service prefixes. */
const GLOBAL_DENY_PREFIXES=['+800','+808','+870','+878','+881','+882','+883','+888','+979','+991'];
/**
 * NANP area codes that are NOT US geographic numbers (Canada, Caribbean,
 * premium/personal/special services). Best-effort list; the exact-number
 * allowlist remains the primary control.
 */
const NANP_NON_US=new Set(('204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 460 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942 '+
  '242 246 264 268 284 345 441 473 649 658 664 721 758 767 784 809 829 849 868 869 876 '+
  '456 500 521 522 523 524 525 526 527 528 529 533 544 566 577 588 600 622 700 710 900 976').split(' '));
const PREMIUM_NXX=new Set(['976']);

/** Hard blocks that apply to every destination, allowlisted or not. */
export function blockedReason(destination,env={}){
  if(typeof destination!=='string'||!E164.test(destination))return 'INVALID_E164';
  if(destination===env.US_BRIDGE_DID)return 'BRIDGE_DID';
  if(GLOBAL_DENY_PREFIXES.some(p=>destination.startsWith(p)))return 'PREMIUM_OR_SPECIAL';
  if(destination.startsWith('+1')){
    const m=US_NUMBER.exec(destination);
    if(!m)return 'INVALID_NANP';
    if(NANP_NON_US.has(m[1]))return 'NANP_NON_US_OR_PREMIUM';
    if(PREMIUM_NXX.has(m[2]))return 'PREMIUM_OR_SPECIAL';
    if(/^[2-9]11$/.test(m[1])||/^[2-9]11$/.test(m[2]))return 'EMERGENCY_OR_N11';
  }
  // E.164 numbers cannot encode bare short codes or 112/911/999, but reject
  // very short national numbers too.
  return null;
}
function countryOf(destination){
  // Longest calling-code match.
  let best=null;
  for(const [iso,cc] of Object.entries(COUNTRY_CODES))
    if(destination.startsWith('+'+cc)&&(!best||cc.length>COUNTRY_CODES[best].length))best=iso;
  return best;
}
function allowedCountries(env){
  return new Set(String(env.ROUTING_ALLOWED_COUNTRIES||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean));
}
/** Owner allowlist: JSON array of {e164,country,rate_cents_per_min,rate_source}. Invalid entries are dropped. */
export function parseDestinations(env={}){
  let list;
  try{list=JSON.parse(env.ROUTING_DESTINATIONS||'[]');}catch{return [];}
  if(!Array.isArray(list))return [];
  return list.filter(d=>d&&typeof d==='object'&&typeof d.e164==='string'&&E164.test(d.e164)&&
    typeof d.country==='string'&&Object.hasOwn(COUNTRY_CODES,d.country)&&
    typeof d.rate_cents_per_min==='number'&&Number.isFinite(d.rate_cents_per_min)&&
    d.rate_cents_per_min>0&&d.rate_cents_per_min<=1000&&
    typeof d.rate_source==='string'&&d.rate_source.trim().length>0)
    .map(d=>({e164:d.e164,country:d.country,rate_cents_per_min:d.rate_cents_per_min,rate_source:d.rate_source.trim()}));
}
/** Full decision for routing to a destination via the owner allowlist. */
export function destinationDecision(destination,env={}){
  const blocked=blockedReason(destination,env);
  if(blocked)return {ok:false,code:blocked};
  const entry=parseDestinations(env).find(d=>d.e164===destination);
  if(!entry)return {ok:false,code:'NOT_ALLOWLISTED'};
  if(countryOf(destination)!==entry.country)return {ok:false,code:'COUNTRY_MISMATCH'};
  if(!allowedCountries(env).has(entry.country))return {ok:false,code:'COUNTRY_NOT_ALLOWED'};
  return {ok:true,entry};
}
function intIn(value,min,max){
  const n=Number(value);
  return typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
}
/** Owner caps; all four are required. Caller-ID mode forces tighter ceilings. */
export function routingCaps(env={},mode='none'){
  const maxSeconds=intIn(env.ROUTING_MAX_CALL_SECONDS,30,HARD_MAX_CALL_SECONDS);
  const maxCallsPerDay=intIn(env.ROUTING_MAX_CALLS_PER_DAY,1,20);
  const maxCentsPerCall=intIn(env.ROUTING_MAX_SPEND_CENTS_PER_CALL,1,10_000);
  const maxCentsPerDay=intIn(env.ROUTING_MAX_SPEND_CENTS_PER_DAY,1,50_000);
  if([maxSeconds,maxCallsPerDay,maxCentsPerCall,maxCentsPerDay].includes(null))return null;
  if(mode==='capped_caller_id')return {maxSeconds:Math.min(maxSeconds,CALLER_ID_MODE_MAX_SECONDS),
    maxCallsPerDay:Math.min(maxCallsPerDay,CALLER_ID_MODE_MAX_CALLS_PER_DAY),maxCentsPerCall,maxCentsPerDay};
  return {maxSeconds,maxCallsPerDay,maxCentsPerCall,maxCentsPerDay};
}
/** Worst-case cost: whole started minutes at the owner-recorded rate. */
export function maxCostCents(entry,seconds){return Math.ceil(entry.rate_cents_per_min*Math.ceil(seconds/60));}
export function utcDayStart(nowSeconds){return nowSeconds-(nowSeconds%86_400);}
/** Reservation TTL: default 90 s, owner may set 30..300 to allow human approval. */
export function reservationTtlSeconds(env={}){return intIn(env.RESERVATION_TTL_SECONDS,30,300)??90;}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/**
 * SignalWire-only deployments can serve the reservation API without any
 * Twilio settings. This does NOT enable routing (see signalwire-routing.mjs).
 */
export function signalWireReservationsConfigured(env={}){
  let url;
  try{url=new URL(env.SIGNALWIRE_SWML_WEBHOOK_URL);}catch{return false;}
  return typeof env.SIGNALWIRE_SIGNING_KEY==='string'&&env.SIGNALWIRE_SIGNING_KEY.length>=16&&
    UUID.test(env.SIGNALWIRE_PROJECT_ID||'')&&url.protocol==='https:'&&
    url.pathname==='/telephony/signalwire/swml'&&!url.search&&!url.username&&
    parseDestinations(env).length>0;
}
