/**
 * Owner-readable log of signed inbound calls (migration 0004).
 * Callers MUST only invoke this after signature + project + DID checks pass.
 * Never throws and never blocks the SWML response: a missing table or D1
 * error just skips logging.
 */
const E164=/^\+[1-9]\d{7,14}$/;
export async function logInboundCall(env,call,handler,outcome){
  try{
    if(!env?.DB||typeof call?.call_id!=='string')return false;
    const from=E164.test(call.from_number||'')?call.from_number:null;
    const to=E164.test(call.to_number||'')?call.to_number:null;
    const match=from!==null&&from===env.TEST_CALLER_E164?1:0;
    await env.DB.prepare('INSERT OR IGNORE INTO inbound_call_log (provider,provider_call_id,handler,from_number,to_number,caller_matches_test_caller,outcome,received_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind('signalwire',call.call_id.slice(0,64),handler,from,to,match,String(outcome).slice(0,64),Math.floor(Date.now()/1000)).run();
    return true;
  }catch{return false;}
}
export async function recentInboundCalls(env,limit=20){
  const n=Math.max(1,Math.min(100,Number.isSafeInteger(limit)?limit:20));
  const r=await env.DB.prepare('SELECT provider_call_id,handler,from_number,to_number,caller_matches_test_caller,outcome,received_at FROM inbound_call_log ORDER BY id DESC LIMIT ?')
    .bind(n).all();
  return (r?.results||[]).map(x=>({...x,received_at_iso:new Date(x.received_at*1000).toISOString()}));
}
