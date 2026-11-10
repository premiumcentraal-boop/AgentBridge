// Owner-only, out-of-band reservation approval / end-marking.
// Usage: AGENTBRIDGE_API_BASE=https://your-worker AGENTBRIDGE_OWNER_TOKEN=... \
//        node scripts/owner-reservation.mjs approve|mark-ended <reservation-uuid>
// Reads the token from the environment only; never prints it.
const [action,id]=process.argv.slice(2);
const base=process.env.AGENTBRIDGE_API_BASE,token=process.env.AGENTBRIDGE_OWNER_TOKEN;
if(!['approve','mark-ended'].includes(action)||!/^[a-f0-9-]{36}$/i.test(id||'')||!base?.startsWith('https://')||!token){
  console.error('Usage: AGENTBRIDGE_API_BASE=https://... AGENTBRIDGE_OWNER_TOKEN=... node scripts/owner-reservation.mjs approve|mark-ended <uuid>');
  process.exit(1);
}
const res=await fetch(new URL('/v1/owner/reservations/'+id+'/'+action,base),{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token}});
console.log(res.status,JSON.stringify(await res.json().catch(()=>({}))));
process.exitCode=res.ok?0:1;
