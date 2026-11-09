import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createServer,READ_ONLY_TOOLS,FORBIDDEN_TOOLS,redact} from '../src/tools.mjs';
import {NUMBER_CARD_URI,NUMBER_CARD_MIME} from '../../backend/src/chat-card.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const SERVER=join(here,'..','server.mjs');
const MOCK=join(here,'mock-fetch.mjs');
const DID='+12025550123';
const PROJECT='271cda55-9a69-4513-b6de-67271d08b9bf';
const SECRET='fake-signalwire-token-must-never-appear';
const CREDS={SIGNALWIRE_SPACE:'example-space',SIGNALWIRE_PROJECT_ID:PROJECT,SIGNALWIRE_API_TOKEN:SECRET};
const BASIC=btoa(PROJECT+':'+SECRET);

/** Minimal env: no inherited SignalWire values from the developer shell. */
function cleanEnv(extra={}){
  const env={PATH:process.env.PATH,HOME:process.env.HOME};
  return {...env,...extra};
}
async function connect(env,{mock}={}){
  const args=[];
  let logFile=null;
  if(mock){
    const dir=mkdtempSync(join(tmpdir(),'ab-mcp-'));
    const fixture=join(dir,'fixture.json');logFile=join(dir,'fetch.log');
    writeFileSync(fixture,JSON.stringify(mock));writeFileSync(logFile,'');
    env={...env,AGENTBRIDGE_MOCK_FETCH_FIXTURE:fixture,AGENTBRIDGE_MOCK_FETCH_LOG:logFile};
    args.push('--import',MOCK);
  }
  args.push(SERVER);
  const transport=new StdioClientTransport({command:process.execPath,args,env,stderr:'pipe'});
  let stderr='';
  transport.stderr?.on('data',d=>{stderr+=d;});
  const client=new Client({name:'agentbridge-test',version:'0.0.0'});
  await client.connect(transport);
  const fetches=()=>logFile&&existsSync(logFile)?readFileSync(logFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  return {client,fetches,stderr:()=>stderr,close:()=>client.close()};
}
const textOf=r=>r.content.map(c=>c.text).join('\n');
function assertNoSecret(value){
  const s=typeof value==='string'?value:JSON.stringify(value);
  assert.ok(!s.includes(SECRET),'secret leaked');
  assert.ok(!s.includes(BASIC),'basic auth leaked');
}

test('stdio: lists exactly the read-only allowlist; no write/paid tools', async()=>{
  const c=await connect(cleanEnv());
  try{
    const {tools}=await c.client.listTools();
    const names=tools.map(t=>t.name).sort();
    assert.deepEqual(names,[...READ_ONLY_TOOLS].sort());
    for(const t of tools){
      assert.equal(t.annotations?.readOnlyHint,true,t.name);
      assert.equal(t.annotations?.destructiveHint,false,t.name);
      assert.ok(!FORBIDDEN_TOOLS.includes(t.name));
      assert.doesNotMatch(t.name,/purchase|buy|reserve|call|dial|send|forward|update|assign|delete|cancel/i);
    }
    for(const n of ['get_bridge_setup','list_my_numbers','search_available_numbers'])
      assert.equal(tools.find(t=>t.name===n)._meta?.ui?.resourceUri,NUMBER_CARD_URI);
    const forbidden=await c.client.callTool({name:'prepare_international_call',arguments:{destination:'+442071234567',idempotency_key:'abcdefgh1'}}).catch(e=>e);
    assert.ok(forbidden instanceof Error||forbidden.isError===true);
  }finally{await c.close();}
});

test('stdio: setup status with no credentials reports not configured, no crash', async()=>{
  const c=await connect(cleanEnv());
  try{
    const r=await c.client.callTool({name:'get_bridge_setup',arguments:{}});
    assert.equal(r.isError,false);
    const body=r.structuredContent;
    assert.equal(body.card_type,'bridge_setup');
    assert.equal(body.provider_connection,'operator_connection_required');
    assert.deepEqual(body.local_server.credentials,{SIGNALWIRE_SPACE:'missing',SIGNALWIRE_PROJECT_ID:'missing',SIGNALWIRE_API_TOKEN:'missing',US_BRIDGE_DID:'missing'});
    assert.equal(body.purchase_enabled,false);assert.equal(body.routing_enabled,false);
    assert.match(r.content[0].text,/SIGNALWIRE_API_TOKEN=missing/);
    assert.deepEqual(JSON.parse(r.content[1].text),body);
    for(const name of ['list_project_numbers','list_my_numbers']){
      const x=await c.client.callTool({name,arguments:{}});
      assert.match(textOf(x),/not configured|BRIDGE_NOT_ASSIGNED|no active, configured US bridge/i,name);
    }
    const s=await c.client.callTool({name:'search_available_numbers',arguments:{area_code:'618'}});
    assert.equal(s.structuredContent.state,'operator_connection_required');
    assert.match(s.content[0].text,/Not configured/);
    assert.doesNotMatch(textOf(s),/undefined/);
  }finally{await c.close();}
});

test('stdio: setup status with credentials shows set/missing only, never values', async()=>{
  const c=await connect(cleanEnv({...CREDS,US_BRIDGE_DID:DID}));
  try{
    const r=await c.client.callTool({name:'get_bridge_setup',arguments:{}});
    assertNoSecret(r);assert.ok(!JSON.stringify(r).includes(PROJECT));
    assert.equal(r.structuredContent.bridge_number,DID);
    assert.equal(r.structuredContent.provider_connection,'server_credentials_configured_unverified');
    assert.equal(r.structuredContent.local_server.credentials.SIGNALWIRE_API_TOKEN,'set');
    assert.equal(c.stderr(),'');
  }finally{await c.close();}
});

test('stdio: inventory + assigned-number + search against mocked SignalWire (GET only)', async()=>{
  const mock={
    '/api/relay/rest/phone_numbers':{body:{data:[
      {id:'n1',number:DID,capabilities:['voice','sms']},
      {id:'n2',number:'+13125550100',capabilities:['voice']},
      {id:'n3',number:'+13125550101',capabilities:['sms']}
    ],links:{next:null}}},
    '/api/relay/rest/phone_numbers/search':{body:{data:[
      {e164:'+16185550123',capabilities:['voice','sms']},
      {e164:'+16185550124',capabilities:['sms']},
      {e164:'+16185550125',capabilities:['voice']}
    ]}}
  };
  const c=await connect(cleanEnv({...CREDS,US_BRIDGE_DID:DID}),{mock});
  try{
    const inv=await c.client.callTool({name:'list_project_numbers',arguments:{}});
    assert.equal(inv.isError,false);
    assert.deepEqual(inv.structuredContent.numbers.map(n=>n.number),[DID,'+13125550100']);
    assert.match(inv.content[0].text,/project voice numbers: 2/);
    assert.match(inv.content[0].text,/\+13125550100/);

    const mine=await c.client.callTool({name:'list_my_numbers',arguments:{}});
    assert.equal(mine.structuredContent.card_type,'owned_number');
    assert.equal(mine.structuredContent.state,'project_inventory_match');
    assert.match(mine.content[0].text,/\+12025550123/);

    const s=await c.client.callTool({name:'search_available_numbers',arguments:{area_code:'618'}});
    assert.equal(s.structuredContent.card_type,'number_choices');
    assert.deepEqual(s.structuredContent.numbers.map(n=>n.number),['+16185550123','+16185550125']);
    assert.ok(s.structuredContent.numbers.every(n=>n.price===null&&n.purchase_enabled===false));
    assert.match(s.content[0].text,/area code 618: 2/);
    assert.deepEqual(JSON.parse(s.content[1].text),s.structuredContent);

    const bad=await c.client.callTool({name:'search_available_numbers',arguments:{area_code:'123'}}).catch(e=>e);
    assert.ok(bad instanceof Error||bad.isError===true);

    for(const r of [inv,mine,s])assertNoSecret(r);
    const reqs=c.fetches();
    assert.equal(reqs.length,3);
    for(const q of reqs){
      assert.equal(q.method,'GET');assert.equal(q.redirect,'error');
      assert.equal(q.host,'example-space.signalwire.com');
      assert.ok(q.path.startsWith('/api/relay/rest/phone_numbers'));
    }
    assert.equal(reqs[2].query.areacode,'618');
    assert.equal(c.stderr(),'');
  }finally{await c.close();}
});

test('stdio: provider failure is sanitized and secret-free', async()=>{
  const mock={'/api/relay/rest/phone_numbers':{status:401,body:{error:SECRET}}};
  const c=await connect(cleanEnv({...CREDS,US_BRIDGE_DID:DID}),{mock});
  try{
    const r=await c.client.callTool({name:'list_project_numbers',arguments:{}});
    assert.equal(r.isError,true);
    assert.match(r.content[0].text,/HTTP 401/);
    assertNoSecret(r);assert.equal(c.stderr(),'');
  }finally{await c.close();}
});

test('stdio: MCP Apps number card resource is served unchanged', async()=>{
  const c=await connect(cleanEnv());
  try{
    const {resources}=await c.client.listResources();
    assert.deepEqual(resources.map(r=>r.uri),[NUMBER_CARD_URI]);
    assert.equal(resources[0].mimeType,NUMBER_CARD_MIME);
    const read=await c.client.readResource({uri:NUMBER_CARD_URI});
    assert.equal(read.contents[0].mimeType,NUMBER_CARD_MIME);
    assert.match(read.contents[0].text,/ui\/initialize/);
    assert.deepEqual(read.contents[0]._meta.ui.csp,{connectDomains:[],resourceDomains:[]});
  }finally{await c.close();}
});

test('in-process guard: registry refuses anything outside the allowlist', ()=>{
  const {registeredTools}=createServer({env:{}});
  assert.deepEqual([...registeredTools].sort(),[...READ_ONLY_TOOLS].sort());
  for(const f of FORBIDDEN_TOOLS)assert.ok(!READ_ONLY_TOOLS.includes(f));
  assert.equal(redact('x '+SECRET+' '+BASIC,CREDS),'x [redacted] [redacted]');
});

test('static guard: server never imports hosted Worker, routing or connect helpers', ()=>{
  const src=readFileSync(join(here,'..','src','tools.mjs'),'utf8')+readFileSync(SERVER,'utf8');
  assert.doesNotMatch(src,/from\s+['"][^'"]*backend\/src\/index\.mjs['"]/);
  for(const sym of ['signalWireConnectPlan','handleSignalWireSwml','prepareReservation','dialXml','console.log'])
    assert.ok(!src.includes(sym),sym);
  assert.doesNotMatch(src,/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/);
});

test('run.sh: loads only allowed keys from a 0600 secrets file, refuses unsafe perms', async()=>{
  const {chmodSync}=await import('node:fs');
  const dir=mkdtempSync(join(tmpdir(),'ab-sec-'));
  const file=join(dir,'signalwire.env');
  writeFileSync(file,'# private\nSIGNALWIRE_SPACE=example-space\nSIGNALWIRE_PROJECT_ID="'+PROJECT+'"\nSIGNALWIRE_API_TOKEN='+SECRET+'\nNODE_OPTIONS=--require=/tmp/evil.js\n');
  chmodSync(file,0o600);
  const run=join(here,'..','run.sh');
  const env=cleanEnv({AGENTBRIDGE_SECRETS_FILE:file,AGENTBRIDGE_NODE:process.execPath});
  const transport=new StdioClientTransport({command:run,args:[],env,stderr:'pipe'});
  const client=new Client({name:'t',version:'0'});
  await client.connect(transport);
  try{
    const r=await client.callTool({name:'get_bridge_setup',arguments:{}});
    assert.equal(r.structuredContent.local_server.credentials.SIGNALWIRE_API_TOKEN,'set');
    assert.equal(r.structuredContent.local_server.credentials_format_valid,true);
    assertNoSecret(r);
  }finally{await client.close();}
  chmodSync(file,0o644);
  const {spawnSync}=await import('node:child_process');
  const bad=spawnSync(run,[],{env,input:'',encoding:'utf8'});
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/unsafe owner\/permissions/);
  assertNoSecret(bad.stderr+bad.stdout);
});
