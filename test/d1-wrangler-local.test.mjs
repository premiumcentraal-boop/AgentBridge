import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,copyFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateMigrationTracker} from '../scripts/d1-migration-preflight.mjs';

// Offline contract test: Wrangler itself creates the D1 tracker in a disposable
// local database. No account, remote API, carrier, or production config is used.
test('pinned Wrangler local D1 migration tracker matches preflight contract', {timeout:120000},()=>{
  const wrangler=resolve('backend/node_modules/.bin/wrangler');
  assert.ok(existsSync(wrangler),'Run npm --prefix backend ci first (pinned Wrangler required)');
  const dir=mkdtempSync(join(tmpdir(),'agentbridge-wrangler-contract-'));
  try{
    mkdirSync(join(dir,'migrations'));
    const config=join(dir,'wrangler.jsonc');
    writeFileSync(config,JSON.stringify({
      name:'agentbridge-disposable-contract-test',
      compatibility_date:'2026-11-01',
      d1_databases:[{binding:'DB',database_name:'agentbridge_contract_probe',
        database_id:'00000000-0000-4000-8000-000000000001',migrations_dir:'migrations'}]
    }));
    writeFileSync(join(dir,'migrations','0001_probe.sql'),
      'CREATE TABLE probe (id INTEGER PRIMARY KEY);\n');
    const persist=join(dir,'persist');
    function run(args){
      const result=spawnSync(wrangler,args,{cwd:dir,encoding:'utf8',timeout:90000,
        env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
      assert.equal(result.status,0,JSON.stringify({args,stdout:result.stdout,stderr:result.stderr,signal:result.signal}));
      return result.stdout;
    }
    run(['d1','migrations','apply','agentbridge_contract_probe','--local',
      '--config',config,'--persist-to',persist]);
    function query(sql){
      const output=run(['d1','execute','agentbridge_contract_probe','--local',
        '--config',config,'--persist-to',persist,'--command',sql,'--json']);
      const parsed=JSON.parse(output.trim());
      assert.ok(Array.isArray(parsed)&&parsed.length===1&&parsed[0].success===true&&
        Array.isArray(parsed[0].results),'Unexpected Wrangler D1 JSON envelope');
      return parsed[0].results;
    }
    // Wrangler's D1 SQL authorization rejects PRAGMA schema_version with SQLITE_AUTH.
    // Keep this integration test limited to supported read-only metadata queries.
    const columns=query('PRAGMA table_info(d1_migrations)');
    const indexes=query('PRAGMA index_list(d1_migrations)');
    const details=indexes.filter(x=>Number(x.unique)===1&&Number(x.partial)===0)
      .map(x=>({name:x.name,columns:query(
        "SELECT seqno, cid, name, \"key\" FROM pragma_index_xinfo('"+
        x.name.replaceAll("'","''")+"')")}));
    assert.deepEqual(validateMigrationTracker(columns,indexes,details),[],
      'Pinned Wrangler tracker no longer matches preflight: review before migration');
    assert.deepEqual(query('SELECT name FROM d1_migrations ORDER BY name')
      .map(x=>x.name),['0001_probe.sql']);
    // Explicitly demonstrate that the validator rejects a corrupted tracker
    // without ever altering the real Wrangler-generated tracker.
    assert.ok(validateMigrationTracker(columns.map(x=>x.name==='applied_at'
      ? {...x,dflt_value:null}:x),indexes,details).length>0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

 
// Exercise the actual CLI against an isolated Wrangler database, not a mocked
// JSON response. Both cases must deny migration recommendations without writes.
test('real local Wrangler CLI rejects empty baseline and counterfeit tracker', {timeout:120000},()=>{
  const wrangler=resolve('backend/node_modules/.bin/wrangler');
  assert.ok(existsSync(wrangler),'Run npm --prefix backend ci first');
  const dir=mkdtempSync(join(tmpdir(),'agentbridge-wrangler-cli-'));
  try{
    const backend=join(dir,'backend');
    mkdirSync(join(dir,'scripts'));
    mkdirSync(join(backend,'node_modules','.bin'),{recursive:true});
    copyFileSync(resolve('scripts/d1-migration-preflight.mjs'),join(dir,'scripts','d1-migration-preflight.mjs'));
    writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    symlinkSync(wrangler,join(backend,'node_modules','.bin','wrangler'));
    writeFileSync(join(backend,'wrangler.jsonc'),JSON.stringify({
      name:'agentbridge-disposable-cli-test',compatibility_date:'2026-11-01',
      d1_databases:[{binding:'DB',database_name:'agentbridge_cli_probe',
        database_id:'00000000-0000-4000-8000-000000000002'}]
    }));
    const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
    function cli(){
      return spawnSync(process.execPath,[join(dir,'scripts','d1-migration-preflight.mjs'),
        '--local','agentbridge_cli_probe'],{cwd:dir,encoding:'utf8',timeout:90000,env});
    }
    const empty=cli();
    assert.equal(empty.status,1,JSON.stringify(empty));
    assert.match(empty.stdout,/Missing base accounts\/reservations tables/);
    assert.doesNotMatch(empty.stderr,/OK: after a backup/);
    // A genuine approved baseline must produce an actionable read-only plan.
    // This proves the full CLI positive path with actual Wrangler/SQLite metadata,
    // rather than merely accepting a mocked response or tracker fixture.
    const baselineSetup=spawnSync(wrangler,['d1','execute','agentbridge_cli_probe','--local',
      '--config','wrangler.jsonc','--file',resolve('backend/schema.sql')],{
      cwd:backend,encoding:'utf8',timeout:90000,env});
    assert.equal(baselineSetup.status,0,JSON.stringify(baselineSetup));
    const validBaseline=cli();
    assert.equal(validBaseline.status,0,JSON.stringify(validBaseline));
    const report=JSON.parse(validBaseline.stdout);
    assert.equal(report.unsafe,false);
    assert.equal(report.plan.safe,true);
    assert.deepEqual(report.plan.baseline,[]);
    assert.deepEqual(report.plan.apply,[
      '0001_routing_controls.sql','0002_approval_bindings.sql',
      '0003_owner_actions.sql','0004_inbound_call_log.sql']);
    assert.match(validBaseline.stderr,/OK: after a backup/);
    // A real Wrangler SQL write only to the disposable local database creates
    // a structurally counterfeit tracker. The preflight itself remains read-only.
    const setup=spawnSync(wrangler,['d1','execute','agentbridge_cli_probe','--local',
      '--config','wrangler.jsonc','--command',
      'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TIMESTAMP NOT NULL);'],{
      cwd:backend,encoding:'utf8',timeout:90000,env});
    assert.equal(setup.status,0,JSON.stringify(setup));
    const counterfeit=cli();
    assert.equal(counterfeit.status,1,JSON.stringify(counterfeit));
    assert.match(counterfeit.stderr,/Untrusted D1 migration tracker/);
    assert.doesNotMatch(counterfeit.stderr,/OK: after a backup/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});


// The CLI must trust a genuine nonempty Wrangler tracker, not just a pristine
// baseline or the separately tested validator. Snapshot reads also prove the
// preflight does not mutate schema/history in this disposable database.
test('real Wrangler CLI accepts applied 0001 history without modifying D1', {timeout:120000},()=>{
  const wrangler=resolve('backend/node_modules/.bin/wrangler');
  assert.ok(existsSync(wrangler),'Run npm --prefix backend ci first');
  const dir=mkdtempSync(join(tmpdir(),'agentbridge-wrangler-applied-'));
  try{
    const backend=join(dir,'backend');
    mkdirSync(join(dir,'scripts'));
    mkdirSync(join(backend,'migrations'),{recursive:true});
    mkdirSync(join(backend,'node_modules','.bin'),{recursive:true});
    copyFileSync(resolve('scripts/d1-migration-preflight.mjs'),join(dir,'scripts','d1-migration-preflight.mjs'));
    copyFileSync(resolve('backend/migrations/0001_routing_controls.sql'),join(backend,'migrations','0001_routing_controls.sql'));
    writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    symlinkSync(wrangler,join(backend,'node_modules','.bin','wrangler'));
    writeFileSync(join(backend,'wrangler.jsonc'),JSON.stringify({
      name:'agentbridge-disposable-applied-test',compatibility_date:'2026-11-01',
      d1_databases:[{binding:'DB',database_name:'agentbridge_applied_probe',
        database_id:'00000000-0000-4000-8000-000000000003',migrations_dir:'migrations'}]
    }));
    const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
    function run(args){
      const result=spawnSync(wrangler,args,{cwd:backend,encoding:'utf8',timeout:90000,env});
      assert.equal(result.status,0,JSON.stringify({args,stdout:result.stdout,stderr:result.stderr}));
      return result.stdout;
    }
    run(['d1','execute','agentbridge_applied_probe','--local','--config','wrangler.jsonc',
      '--file',resolve('backend/schema.sql')]);
    run(['d1','migrations','apply','agentbridge_applied_probe','--local','--config','wrangler.jsonc']);
    function query(sql){
      const parsed=JSON.parse(run(['d1','execute','agentbridge_applied_probe','--local',
        '--config','wrangler.jsonc','--command',sql,'--json']).trim());
      assert.equal(parsed.length,1);
      assert.equal(parsed[0].success,true);
      return parsed[0].results;
    }
    function snapshot(){
      return {
        schema:query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
        history:query('SELECT id,name,applied_at FROM d1_migrations ORDER BY id')
      };
    }
    const before=snapshot();
    assert.deepEqual(before.history.map(row=>row.name),['0001_routing_controls.sql']);
    const cli=spawnSync(process.execPath,[join(dir,'scripts','d1-migration-preflight.mjs'),
      '--local','agentbridge_applied_probe'],{cwd:dir,encoding:'utf8',timeout:90000,env});
    assert.equal(cli.status,0,JSON.stringify(cli));
    const report=JSON.parse(cli.stdout);
    assert.equal(report.unsafe,false);
    assert.equal(report.tracked,true);
    assert.deepEqual(report.applied,['0001_routing_controls.sql']);
    assert.deepEqual(report.plan.baseline,[]);
    assert.deepEqual(report.plan.apply,[
      '0002_approval_bindings.sql','0003_owner_actions.sql','0004_inbound_call_log.sql'
    ]);
    assert.match(cli.stderr,/OK: after a backup/);
    assert.deepEqual(snapshot(),before,'Preflight must leave schema and tracker history untouched');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
