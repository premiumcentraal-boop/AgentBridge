// Separate owner-side CLI; NEVER give AGENTBRIDGE_OWNER_TOKEN to a chat agent.
// 1) review <id> prints exact destination, TTL, source, US caps and proposal digest.
// 2) inspect and confirm those values OUT OF BAND.
// 3) approve <id> with AGENTBRIDGE_PROPOSAL_DIGEST from that review.
// Owner-only mark-ended intentionally cannot release the lock without carrier proof.
// 4) force-unlock <id>: tries carrier reconciliation first; if that fails it needs
//    AGENTBRIDGE_FORCE=yes and AGENTBRIDGE_UNLOCK_REASON="..." (8-500 chars), and is
//    recorded in the owner_actions audit table. Check the SignalWire dashboard first.
const [action,id]=process.argv.slice(2);
const base=process.env.AGENTBRIDGE_API_BASE,token=process.env.AGENTBRIDGE_OWNER_TOKEN;
const digest=process.env.AGENTBRIDGE_PROPOSAL_DIGEST;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if(!['review','approve','mark-ended','force-unlock'].includes(action)||!UUID.test(id||'')||
   !base?.startsWith('https://')||!token||
   (action==='approve'&&!/^[a-f0-9]{64}$/.test(digest||''))){
  console.error('Usage: AGENTBRIDGE_API_BASE=https://... AGENTBRIDGE_OWNER_TOKEN=<secret> node scripts/owner-reservation.mjs review <uuid>');
  console.error('Then inspect the quote; for approve set AGENTBRIDGE_PROPOSAL_DIGEST=<review digest> and repeat with approve <uuid>.');
  console.error('After a call: mark-ended <uuid>. If stuck: force-unlock <uuid> (optionally AGENTBRIDGE_FORCE=yes AGENTBRIDGE_UNLOCK_REASON="...").');
  process.exit(1);
}
let body;
if(action==='approve')body={proposal_digest:digest};
if(action==='force-unlock'){
  body={};
  if(process.env.AGENTBRIDGE_FORCE==='yes'){
    const reason=(process.env.AGENTBRIDGE_UNLOCK_REASON||'').trim();
    if(reason.length<8||reason.length>500){
      console.error('AGENTBRIDGE_UNLOCK_REASON must be 8-500 characters when AGENTBRIDGE_FORCE=yes');
      process.exit(1);
    }
    body={force:true,reason};
  }
}
const res=await fetch(new URL('/v1/owner/reservations/'+id+'/'+action,base),{
  method:action==='review'?'GET':'POST',redirect:'error',
  headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
const output=await res.json().catch(()=>({error:{code:'INVALID_RESPONSE',message:'Unknown response'}}));
console.log(res.status,JSON.stringify(output,null,2));
process.exitCode=res.ok?0:1;
