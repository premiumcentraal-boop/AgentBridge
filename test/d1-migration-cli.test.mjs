import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,copyFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const cli=resolve('scripts/d1-migration-preflight.mjs');
const mock=`#!/usr/bin/env node
const fs=require('node:fs');
const argv=process.argv.slice(2);
const sql=argv[argv.indexOf('--command')+1];
if(argv[0]!=='d1'||argv[1]!=='execute'||!argv.includes('--local')||!argv.includes('--json')||!sql)process.exit(81);
fs.appendFileSync(process.env.QUERY_LOG,JSON.stringify(sql)+'\\n');
if(process.env.FIXTURE==='invalid-json'){console.log('not JSON');process.exit(0);}
if(process.env.FIXTURE==='failed-query'){console.log(JSON.stringify([{success:false,results:[]}]));process.exit(0);}
if(process.env.FIXTURE==='missing-success'){console.log(JSON.stringify([{results:[]}]));process.exit(0);}
if(process.env.FIXTURE==='extra-results'){console.log(JSON.stringify([{success:true,results:[]},{success:false,results:[]}]));process.exit(0);}
if(process.env.FIXTURE==='object-response'){console.log(JSON.stringify({success:true,results:[]}));process.exit(0);}
const col=(name,pk=0,notnull=1,type='TEXT')=>({name,pk,notnull,type});
const trackerIndex={name:'sqlite_autoindex_d1_migrations_1',unique:1,partial:0};
const reservationIndex={name:'sqlite_autoindex_reservations_2',unique:1,partial:0};
let rows;
if(sql==='SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name'){
  const count=(fs.readFileSync(process.env.QUERY_LOG,'utf8').match(/sqlite_master ORDER BY type, name/g)||[]).length;
  rows=[{type:'table',name:count===2&&process.env.FIXTURE==='schema-drift'?'changed':'accounts',tbl_name:'accounts',sql:'CREATE TABLE accounts(id INTEGER)'}];
}
else if(sql==='PRAGMA table_info(reservations)')rows=['id','account_id','destination','idempotency_key','status','created_at','expires_at'].map(name=>col(name,name==='id'?1:0,name==='id'?0:1));
else if(sql==="SELECT name FROM sqlite_master WHERE type='table'")rows=[{name:'accounts'},{name:'reservations'},{name:'d1_migrations'}];
else if(sql==='PRAGMA table_info(d1_migrations)')rows=[col('id',1,0,'INTEGER'),col('name',0,0),{...col('applied_at',0,1,'TIMESTAMP'),dflt_value:process.env.FIXTURE==='missing-timestamp-default'?null:'CURRENT_TIMESTAMP'}];
else if(sql==='PRAGMA index_list(d1_migrations)')rows=process.env.FIXTURE==='missing-unique'?[]:[trackerIndex];
else if(sql.includes("pragma_index_xinfo('sqlite_autoindex_d1_migrations_1')"))rows=[{seqno:0,cid:1,name:'name',key:1},{seqno:1,cid:-1,name:null,key:0}];
else if(sql==='SELECT id, name, applied_at FROM d1_migrations ORDER BY name, id'){
  const count=(fs.readFileSync(process.env.QUERY_LOG,'utf8').match(/SELECT id, name, applied_at FROM d1_migrations ORDER BY name, id/g)||[]).length;
  const entry=(name,id=1,applied_at='2026-11-17 00:00:00')=>({id,name,applied_at});
  rows=process.env.FIXTURE==='history-drift'&&count===2?[entry('0001_routing_controls.sql')]:
    process.env.FIXTURE==='timestamp-drift'?[entry('0001_routing_controls.sql',1,count===2?'2026-11-17 01:00:00':'2026-11-17 00:00:00')]:
    process.env.FIXTURE==='id-drift'?[entry('0001_routing_controls.sql',count===2?2:1)]:
    // A transient A -> B -> A mutation between independent observations is
    // inherently invisible to this read-only CLI without snapshot isolation.
    process.env.FIXTURE==='history-aba'?[]:
    process.env.FIXTURE==='unknown-history'?[entry('9999_unapproved.sql')]:
    process.env.FIXTURE==='duplicate-history'?[entry('0001_routing_controls.sql'),entry('0001_routing_controls.sql',2)]:[];
}
else if(sql==='PRAGMA foreign_key_list(reservations)'){
  // Simulate an external actor changing and restoring the tracker between
  // the two history snapshots. The CLI cannot observe this transient state.
  if(process.env.FIXTURE==='history-aba')fs.writeFileSync(process.env.ABA_TRACE,'A -> B -> A');
  rows=[{from:'account_id',table:'accounts',to:'id',on_delete:'RESTRICT'}];
}
else if(sql==='PRAGMA index_list(reservations)')rows=[reservationIndex];
else if(sql.includes("pragma_index_xinfo('sqlite_autoindex_reservations_2')"))rows=[{seqno:0,cid:1,name:'account_id',key:1},{seqno:1,cid:3,name:'idempotency_key',key:1}];
else process.exit(82);
console.log(JSON.stringify([{success:true,results:rows}]));
`;

test('preflight CLI checks tracker before history, fails closed on malformed responses and issues no SQL writes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'agentbridge-preflight-'));
  try{
    mkdirSync(join(dir,'scripts'));
    mkdirSync(join(dir,'backend'));
    copyFileSync(cli,join(dir,'scripts','d1-migration-preflight.mjs'));
    writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    writeFileSync(join(dir,'backend','wrangler.jsonc'),'{}');
    const executable=join(dir,'mock-wrangler.cjs');
    writeFileSync(executable,mock);
    chmodSync(executable,0o700);
    for(const [scenario,status,pattern] of [
      ['valid',0,/OBSERVATION ONLY: pending migrations:/],
      ['missing-unique',1,/Untrusted D1 migration tracker:.*UNIQUE/],
      ['missing-timestamp-default',1,/Untrusted D1 migration tracker:.*CURRENT_TIMESTAMP default/],
      ['invalid-json',1,/Wrangler did not return JSON/],
      ['failed-query',1,/Unexpected D1 query response/],
      ['missing-success',1,/Unexpected D1 query response/],
      ['extra-results',1,/Unexpected D1 query response/],
      ['object-response',1,/Unexpected D1 query response/],
      ['unknown-history',1,/BLOCKED: partial schema/],
      ['duplicate-history',1,/BLOCKED: partial schema/],
      ['schema-drift',1,/schema or migration history changed during preflight/],
      ['history-drift',1,/schema or migration history changed during preflight/],
      ['timestamp-drift',1,/schema or migration history changed during preflight/],
      ['id-drift',1,/schema or migration history changed during preflight/],
      ['history-aba',0,/OBSERVATION ONLY: pending migrations:/]
    ]){
      const log=join(dir,scenario+'.queries');
      const abaTrace=join(dir,scenario+'.aba');
      const run=spawnSync(process.execPath,[join(dir,'scripts','d1-migration-preflight.mjs'),'--local','disposable'],{
        cwd:dir,encoding:'utf8',timeout:15000,
        env:{...process.env,AGENTBRIDGE_WRANGLER:executable,QUERY_LOG:log,ABA_TRACE:abaTrace,FIXTURE:scenario}
      });
      assert.equal(run.status,status,scenario+': '+run.stderr);
      if(['valid','history-aba','unknown-history','duplicate-history'].includes(scenario)){
        const report=JSON.parse(run.stdout);
        assert.equal(report.verdict.version,1,scenario);
        assert.equal(report.verdict.atomicSnapshot,false,scenario);
        assert.equal(report.verdict.authorizesMigration,false,scenario);
        assert.equal(report.verdict.requiresOperatorApproval,true,scenario);
        assert.equal(report.verdict.requiresExclusiveMaintenanceWindow,true,scenario);
        assert.equal(report.verdict.requiresVerifiedBackup,true,scenario);
        assert.equal(report.verdict.status,['unknown-history','duplicate-history'].includes(scenario)?'blocked':'observational_only',scenario);
      }
      assert.match(run.stderr,pattern,scenario);
      if(scenario==='history-aba')assert.equal(readFileSync(abaTrace,'utf8'),'A -> B -> A');
      if(['unknown-history','duplicate-history'].includes(scenario)){
        const report=JSON.parse(run.stdout);
        assert.equal(report.unsafe,true,scenario+': history must be unsafe');
        assert.equal(report.plan.safe,false,scenario+': no migration plan');
        assert.deepEqual(report.plan.apply,[],scenario+': no apply recommendation');
        assert.match(report.reasons.join(' '),/Migration history claims applied objects/,scenario);
      }
      const queries=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
      if(['valid','history-aba','history-drift','timestamp-drift','id-drift','unknown-history','duplicate-history'].includes(scenario)){
        assert.ok(queries.includes('SELECT id, name, applied_at FROM d1_migrations ORDER BY name, id'),scenario+': migration history must be read in deterministic order');
        assert.ok(!queries.includes('SELECT name FROM d1_migrations'),scenario+': unordered migration history is forbidden');
      }
      assert.ok(queries.every(sql=>/^(PRAGMA |SELECT )/i.test(sql)),scenario+': no writes');
      assert.ok(!queries.includes('PRAGMA schema_version'),scenario+': Wrangler denies schema_version with SQLITE_AUTH');
      if(['missing-unique','missing-timestamp-default'].includes(scenario))assert.ok(!queries.includes('SELECT name FROM d1_migrations ORDER BY name'),'must not trust invalid tracker');
      if(status!==0)assert.doesNotMatch(run.stderr,/OBSERVATION ONLY: pending migrations:/);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('preflight never prints blind baseline tracker writes or conflict-suppressing SQL',()=>{
  const source=readFileSync(cli,'utf8');
  assert.doesNotMatch(source,/INSERT OR IGNORE INTO d1_migrations/);
  assert.doesNotMatch(source,/CREATE TABLE IF NOT EXISTS d1_migrations/);
  assert.match(source,/No automatic baseline reconciliation SQL is safe/);
  assert.match(source,/exclusive maintenance window/);
  assert.doesNotMatch(source,/console\.error\('OK: all migrations present/);
  assert.match(source,/OBSERVATION ONLY: all migrations appear present and recorded/);
  assert.match(source,/independent queries are not an atomic snapshot/);
});

// Deliberate limitation test: a transient migration-history mutation reverted
// between observations cannot be detected by independent Wrangler queries.
// This is why successful preflight is never authorization to migrate without
// an exclusive maintenance window, backup, and operator approval.
test('ABA history fixture demonstrates non-atomic preflight limitation',()=>{
  const source=readFileSync(cli,'utf8');
  assert.match(source,/Separate queries are NOT an atomic snapshot/);
  assert.match(source,/exclusive migration/);
});
