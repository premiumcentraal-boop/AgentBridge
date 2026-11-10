#!/usr/bin/env node
/**
 * Read-only D1 migration preflight. Never mutates or deploys anything.
 * Example: node scripts/d1-migration-preflight.mjs --remote agentbridge-prototype
 * Requires a Wrangler installation and private backend/wrangler.jsonc config.
 */
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const V1=['approved_at','pin_sha256','pin_attempts','provider','provider_call_id','claimed_at','max_call_seconds','max_cost_cents'];
const V2=['reservation_approval_bindings','reservation_carrier_legs'];
export function classifyMigrationState(columns,tables){
  const col=new Set(columns),tab=new Set(tables);
  const old=V1.filter(x=>col.has(x));
  const hasLedger=tab.has('provider_events');
  const next=V2.filter(x=>tab.has(x));
  const v1=old.length===0&&!hasLedger?'absent':
    old.length===V1.length&&hasLedger?'complete':'PARTIAL';
  const v2=next.length===0?'absent':next.length===V2.length?'complete':'PARTIAL';
  const unsafe=v1==='PARTIAL'||v2==='PARTIAL'||(v2==='complete'&&v1!=='complete');
  return {v1,v2,unsafe,reasons:unsafe?['Schema is inconsistent. Do not apply migrations before backup and manual reconciliation.']:[]};
}
function parseWranglerJson(raw){
  const trimmed=String(raw).trim();
  let parsed;
  try{parsed=JSON.parse(trimmed);}catch{throw Error('Wrangler did not return JSON. Refusing to guess database state.');}
  const item=Array.isArray(parsed)?parsed[0]:parsed;
  if(!item||!Array.isArray(item.results)||item.success===false)
    throw Error('Unexpected D1 query response. No schema state can be trusted.');
  return item.results;
}
function inspect(database,mode,sql){
  const executable=process.env.AGENTBRIDGE_WRANGLER||'wrangler';
  const out=execFileSync(executable,['d1','execute',database,mode,'--config','backend/wrangler.jsonc','--command',sql,'--json'],{
    encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']
  });
  return parseWranglerJson(out);
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const [mode,database]=process.argv.slice(2);
  if(!['--remote','--local'].includes(mode)||!/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(database||'')||
     !existsSync('backend/wrangler.jsonc')){
    console.error('Usage: node scripts/d1-migration-preflight.mjs --remote|--local <database-name> (from repository root with private backend/wrangler.jsonc)');
    process.exit(2);
  }
  try{
    const cols=inspect(database,mode,'PRAGMA table_info(reservations)').map(x=>x.name);
    const tables=inspect(database,mode,"SELECT name FROM sqlite_master WHERE type='table'").map(x=>x.name);
    const state=classifyMigrationState(cols,tables);
    console.log(JSON.stringify({mode,database,...state,tracked:tables.includes('d1_migrations')},null,2));
    if(state.unsafe){
      console.error('BLOCKED: partial schema; inspect D1 backup before any write.');
      process.exitCode=1;
    }else if(state.v1==='complete'&&!tables.includes('d1_migrations')){
      console.error('NOTICE: 0001 may have been applied manually before Wrangler tracking. Do not run migrations apply until the verified baseline is registered safely.');
      process.exitCode=2;
    }else if(state.v1==='absent'){
      console.error('NOTICE: fresh base schema. Apply tracked migration 0001 and 0002 only after reviewing the backup and correct database identity.');
    }else{
      console.error('NOTICE: inspect Wrangler migrations list before applying anything.');
    }
  }catch(e){
    console.error('Preflight failed closed: '+String(e?.message||e).slice(0,400));
    process.exitCode=1;
  }
}
