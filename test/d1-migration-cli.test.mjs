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
if(sql==='SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name'){\n  const count=(fs.readFileSync(process.env.QUERY_LOG,'utf8').match(/sqlite_master ORDER BY type, name/g)||[]).length;\n  rows=[{type:'table',name:count===2&&process.env.FIXTURE==='schema-drift'?'changed':'accounts',tbl_name:'accounts',sql:'CREATE TABLE accounts(id INTEGER)'}];\n}\nelse if(sql==='PRAGMA table_info(reservations)')rows=['id','account_id','destination','idempotency_key','status','created_at','expires_at'].map(name=>col(name,name==='id'?1:0,name==='id'?0:1));
else if(sql==="SELECT name FROM sqlite_master WHERE type='table'")rows=[{name:'accounts'},{name:'reservations'},{name:'d1_migrations'}];
else if(sql==='PRAGMA table_info(d1_migrations)')rows=[col('id',1,0,'INTEGER'),col('name',0,0),col('applied_at',0,1,'TIMESTAMP')];
else if(sql==='PRAGMA index_list(d1_migrations)')rows=process.env.FIXTURE==='missing-unique'?[]:[trackerIndex];
else if(sql.includes("pragma_index_xinfo('sqlite_autoindex_d1_migrations_1')"))rows=[{seqno:0,cid:1,name:'name',key:1},{seqno:1,cid:-1,name:null,key:0}];
else if(sql==='SELECT name FROM d1_migrations')rows=process.env.FIXTURE==='history-drift'&&(fs.readFileSync(process.env.QUERY_LOG,'utf8').match(/SELECT name FROM d1_migrations/g)||[]).length===2?[{name:'0001_routing_controls.sql'}]:process.env.FIXTURE==='unknown-history'?[{name:'9999_unapproved.sql'}]:process.env.FIXTURE==='duplicate-history'?[{name:'0001_routing_controls.sql'},{name:'0001_routing_controls.sql'}]:[];
else if(sql==='PRAGMA foreign_key_list(reservations)')rows=[{from:'account_id',table:'accounts',to:'id',on_delete:'RESTRICT'}];
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
      ['valid',0,/OK: after a backup/],
      ['missing-unique',1,/Untrusted D1 migration tracker:.*UNIQUE/],
      ['invalid-json',1,/Wrangler did not return JSON/],
      ['failed-query',1,/Unexpected D1 query response/],
      ['missing-success',1,/Unexpected D1 query response/],
      ['extra-results',1,/Unexpected D1 query response/],
      ['object-response',1,/Unexpected D1 query response/],
      ['unknown-history',1,/BLOCKED: partial schema/],
      ['duplicate-history',1,/BLOCKED: partial schema/],\n      ['schema-drift',1,/schema or migration history changed during preflight/],\n      ['history-drift',1,/schema or migration history changed during preflight/]
    ]){
      const log=join(dir,scenario+'.queries');
      const run=spawnSync(process.execPath,[join(dir,'scripts','d1-migration-preflight.mjs'),'--local','disposable'],{
        cwd:dir,encoding:'utf8',timeout:15000,
        env:{...process.env,AGENTBRIDGE_WRANGLER:executable,QUERY_LOG:log,FIXTURE:scenario}
      });
      assert.equal(run.status,status,scenario+': '+run.stderr);
      assert.match(run.stderr,pattern,scenario);
      if(['unknown-history','duplicate-history'].includes(scenario)){
        const report=JSON.parse(run.stdout);
        assert.equal(report.unsafe,true,scenario+': history must be unsafe');
        assert.equal(report.plan.safe,false,scenario+': no migration plan');
        assert.deepEqual(report.plan.apply,[],scenario+': no apply recommendation');
        assert.match(report.reasons.join(' '),/Migration history claims applied objects/,scenario);
      }
      const queries=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
      assert.ok(queries.every(sql=>/^(PRAGMA |SELECT )/i.test(sql)),scenario+': no writes');
      if(scenario==='missing-unique')assert.ok(!queries.includes('SELECT name FROM d1_migrations'),'must not trust invalid tracker');
      if(status!==0)assert.doesNotMatch(run.stderr,/OK: after a backup/);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
