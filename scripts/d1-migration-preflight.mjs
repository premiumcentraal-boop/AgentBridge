#!/usr/bin/env node
/**
 * Read-only D1 migration preflight. Never mutates or deploys anything.
 * Example: node scripts/d1-migration-preflight.mjs --remote agentbridge-prototype
 * Requires a Wrangler installation and private backend/wrangler.jsonc config.
 */
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
// Pinned Wrangler from backend/package.json (npm --prefix backend ci) is preferred.
// Wrangler runs with cwd=backend/ so it finds backend/node_modules (its cache
// lives in node_modules/.cache); running it from the repo root fails when the
// root has no node_modules (EACCES on /node_modules/.cache).
const BACKEND=resolve('backend');
const PINNED_WRANGLER=resolve(BACKEND,'node_modules/.bin/wrangler');

const V1=['approved_at','pin_sha256','pin_attempts','provider','provider_call_id','claimed_at','max_call_seconds','max_cost_cents'];
const V2=['reservation_approval_bindings','reservation_carrier_legs'];
const V3=['owner_actions'];
const V4=['inbound_call_log'];
export const MIGRATION_FILES=['0001_routing_controls.sql','0002_approval_bindings.sql','0003_owner_actions.sql','0004_inbound_call_log.sql'];
/**
 * 0001 uses ALTER TABLE ADD COLUMN, which SQLite/D1 cannot make re-runnable.
 * This plan is the guard: it only ever lists 0001 when NONE of its columns exist.
 * 0002/0003 are CREATE ... IF NOT EXISTS and safe to re-run.
 */
export function migrationPlan(state,applied=[]){
  if(state.unsafe)return {safe:false,apply:[],baseline:[]};
  const done=new Set(applied);
  const present={'0001_routing_controls.sql':state.v1==='complete',
    '0002_approval_bindings.sql':state.v2==='complete','0003_owner_actions.sql':state.v3==='complete',
    '0004_inbound_call_log.sql':state.v4==='complete'};
  const baseline=MIGRATION_FILES.filter(f=>present[f]&&!done.has(f));
  const apply=MIGRATION_FILES.filter(f=>!present[f]&&!done.has(f));
  return {safe:true,apply,baseline};
}
export function baselineSql(files){
  if(!files.length)return '';
  return "CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); "+
    files.map(f=>"INSERT OR IGNORE INTO d1_migrations (name) VALUES ('"+f+"');").join(' ');
}
export function classifyMigrationState(columns,tables){
  const col=new Set(columns),tab=new Set(tables);
  const old=V1.filter(x=>col.has(x));
  const hasLedger=tab.has('provider_events');
  const next=V2.filter(x=>tab.has(x));
  const v1=old.length===0&&!hasLedger?'absent':
    old.length===V1.length&&hasLedger?'complete':'PARTIAL';
  const v2=next.length===0?'absent':next.length===V2.length?'complete':'PARTIAL';
  const v3=V3.every(x=>tab.has(x))?'complete':'absent';
  const v4=V4.every(x=>tab.has(x))?'complete':'absent';
  const unsafe=v1==='PARTIAL'||v2==='PARTIAL'||(v2==='complete'&&v1!=='complete')||
    (v3==='complete'&&v2!=='complete')||(v4==='complete'&&v1!=='complete');
  return {v1,v2,v3,v4,unsafe,reasons:unsafe?['Schema is inconsistent. Do not apply migrations before backup and manual reconciliation.']:[]};
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
  const executable=process.env.AGENTBRIDGE_WRANGLER||(existsSync(PINNED_WRANGLER)?PINNED_WRANGLER:'wrangler');
  const out=execFileSync(executable,['d1','execute',database,mode,'--config','wrangler.jsonc','--command',sql,'--json'],{
    cwd:BACKEND,encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']
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
    const tracked=tables.includes('d1_migrations');
    const applied=tracked?inspect(database,mode,'SELECT name FROM d1_migrations').map(x=>x.name):[];
    const plan=migrationPlan(state,applied);
    console.log(JSON.stringify({mode,database,...state,tracked,applied,plan},null,2));
    if(state.unsafe){
      console.error('BLOCKED: partial schema; inspect D1 backup before any write.');
      process.exitCode=1;
    }else if(plan.baseline.length){
      console.error('NOTICE: these migrations are already present but not recorded by Wrangler: '+plan.baseline.join(', ')+
        '. After a backup, record them WITHOUT re-running them, e.g.:');
      console.error('  (cd backend && npx wrangler d1 execute '+database+' '+mode+' --command "'+baselineSql(plan.baseline)+'")');
      console.error('Then re-run this preflight before `wrangler d1 migrations apply`.');
      process.exitCode=2;
    }else if(plan.apply.length){
      console.error('OK: after a backup, `(cd backend && npx wrangler d1 migrations apply '+database+' '+mode+')` will apply: '+plan.apply.join(', '));
    }else{
      console.error('OK: all migrations present and recorded. Nothing to apply.');
    }
  }catch(e){
    console.error('Preflight failed closed: '+String(e?.message||e).slice(0,400));
    process.exitCode=1;
  }
}
