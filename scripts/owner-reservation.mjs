// Separate owner-side CLI; NEVER give AGENTBRIDGE_OWNER_TOKEN to a chat agent.
// 1) review <id> prints exact destination, TTL, source, US caps and proposal digest.
// 2) inspect and confirm those values OUT OF BAND.
// 3) approve <id> with AGENTBRIDGE_PROPOSAL_DIGEST from that review.
// Owner-only mark-ended intentionally cannot release the lock without carrier proof.
const [action,id]=process.argv.slice(2);
const base=process.env.AGENTBRIDGE_API_BASE,token=process.env.AGENTBRIDGE_OWNER_TOKEN;
const digest=process.env.AGENTBRIDGE_PROPOSAL_DIGEST;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if(!['review','approve','mark-ended'].includes(action)||!UUID.test(id||'')||
   !base?.startsWith('https://')||!token||
   (action==='approve'&&!/^[a-f0-9]{64}$/.test(digest||''))){
  console.error('Usage: AGENTBRIDGE_API_BASE=https://... AGENTBRIDGE_OWNER_TOKEN=<secret> node scripts/owner-reservation.mjs review <uuid>');
  console.error('Then inspect the quote; for approve set AGENTBRIDGE_PROPOSAL_DIGEST=<review digest> and repeat with approve <uuid>.');
  process.exit(1);
}
const res=await fetch(new URL('/v1/owner/reservations/'+id+'/'+action,base),{
  method:action==='review'?'GET':'POST',redirect:'error',
  headers:{authorization:'Bearer '+token,...(action==='approve'?{'content-type':'application/json'}:{})},
  ...(action==='approve'?{body:JSON.stringify({proposal_digest:digest})}:{})
});
const output=await res.json().catch(()=>({error:{code:'INVALID_RESPONSE',message:'Unknown response'}}));
console.log(res.status,JSON.stringify(output,null,2));
process.exitCode=res.ok?0:1;
