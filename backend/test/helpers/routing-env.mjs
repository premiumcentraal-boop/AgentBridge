/** Shared fixtures for SignalWire routing tests (fake values only). */
import {createHmac} from 'node:crypto';
import worker,{sha256} from '../../src/index.mjs';
import {createD1} from './d1.mjs';

export const T0=1_800_000_000;
export const DID='+12025550123',DEST='+12125550100',INTL='+31201234567',CALLER='+12125550177';
export const TOKEN='ab_'+'k'.repeat(48);
export const OWNER='owner_'+'o'.repeat(48);
export const BASE='https://api.example.com';
export const PROJECT='271cda55-9a69-4513-b6de-67271d08b9bf';
export const SIGNING='unit-test-signing-key-secret-32bytes';
export const SWML_URL=BASE+'/telephony/signalwire/swml';
export const PIN_URL=BASE+'/telephony/signalwire/swml/pin';

export async function routingSetup(t,extra={}){
  try{t.mock.timers.enable({apis:['Date'],now:T0*1000});}catch{t.mock.timers.setTime(T0*1000);}
  const DB=createD1();
  DB.raw.prepare("INSERT INTO accounts (id,api_key_sha256,did,status) VALUES ('acct',?,?,'active')").run(await sha256(TOKEN),DID);
  const env={DB,US_BRIDGE_DID:DID,CALLER_PROOF_MODE:'dtmf_pin',
    SIGNALWIRE_SIGNING_KEY:SIGNING,SIGNALWIRE_PROJECT_ID:PROJECT,SIGNALWIRE_SWML_WEBHOOK_URL:SWML_URL,
    ROUTING_ALLOWED_COUNTRIES:'US,NL',
    ROUTING_DESTINATIONS:JSON.stringify([
      {e164:DEST,country:'US',rate_cents_per_min:2,rate_source:'owner-recorded test rate'},
      {e164:INTL,country:'NL',rate_cents_per_min:10,rate_source:'owner-recorded test rate'}]),
    US_PILOT_TEST_DESTINATION:DEST,US_PILOT_DESTINATION_VERIFIED:'true',
    US_PILOT_INBOUND_RATE_CENTS_PER_MIN:'1',US_PILOT_INBOUND_RATE_SOURCE:'operator-reviewed inbound rate',
    ROUTING_MAX_CALL_SECONDS:'60',ROUTING_MAX_CALLS_PER_DAY:'1',
    ROUTING_MAX_SPEND_CENTS_PER_CALL:'50',ROUTING_MAX_SPEND_CENTS_PER_DAY:'100',
    RESERVATION_TTL_SECONDS:'240',
    OWNER_APPROVAL_TOKEN_SHA256:await sha256(OWNER),
    ...extra};
  for(const [k,v] of Object.entries(env))if(v===undefined)delete env[k];
  return {DB,env,at:s=>t.mock.timers.setTime(s*1000)};
}
export const api=(path,method='GET',body,token=TOKEN)=>new Request(BASE+path,{method,
  headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined});
export const owner=(id,action='approve',token=OWNER,digest)=>new Request(BASE+'/v1/owner/reservations/'+id+'/'+action,{
  method:action==='review'?'GET':'POST',
  headers:{authorization:'Bearer '+token,...(digest?{'content-type':'application/json'}:{})},
  body:digest?JSON.stringify({proposal_digest:digest}):undefined
});
export async function approveReservation(env,id,token=OWNER){
  // Simulate real owner: GET the exact server proposal, then explicitly submit its digest.
  const reviewed=await worker.fetch(owner(id,'review',token),env);
  if(reviewed.status!==200)return reviewed;
  const body=await reviewed.json();
  return worker.fetch(owner(id,'approve',token,body.proposal_digest),env);
}
export function call(over={}){
  const id=over.call_id||'38313c74-b321-4c08-a3ea-7123449130ab';
  // SignalWire Voice Logs are keyed by segment_id (distinct from call_id).
  const segment='4'+id.slice(1);
  return {project_id:PROJECT,call_id:id,segment_id:segment,direction:'inbound',type:'phone',
    from_number:CALLER,to_number:DID,...over};
}
export function swml(payload,url=SWML_URL,{sign=true,key=SIGNING,signUrl=url}={}){
  const raw=JSON.stringify(payload);
  const sig=createHmac('sha256',key).update(signUrl+raw).digest('hex');
  return new Request(url,{method:'POST',headers:{'content-type':'application/json',...(sign?{'x-signalwire-sha256-signature':sig}:{})},body:raw});
}
