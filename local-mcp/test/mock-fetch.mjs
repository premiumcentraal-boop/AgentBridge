/**
 * TEST-ONLY preload (node --import). Replaces global fetch in the spawned
 * server so no network request reaches SignalWire. Never used in production.
 */
import {readFileSync,appendFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(process.env.AGENTBRIDGE_MOCK_FETCH_FIXTURE,'utf8'));
const log=process.env.AGENTBRIDGE_MOCK_FETCH_LOG;
globalThis.fetch=async(url,opts={})=>{
  const u=new URL(url);
  appendFileSync(log,JSON.stringify({method:opts.method,host:u.hostname,path:u.pathname,
    query:Object.fromEntries(u.searchParams),redirect:opts.redirect,
    auth:opts.headers?.authorization??null})+'\n');
  const hit=fixture[u.pathname];
  if(!hit)return new Response('not found',{status:404});
  return new Response(JSON.stringify(hit.body),{status:hit.status??200,headers:{'content-type':'application/json'}});
};
