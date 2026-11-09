import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {dispatch,boundedLines} from '../../scripts/local-number-mcp.mjs';
import {Readable} from 'node:stream';
const env={US_BRIDGE_DID:'+12025550123'};
const call=(name,args={})=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
test('local adapter exposes exactly three non-mutating tools',async()=>{
 const out=await dispatch({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.deepEqual(out.result.tools.map(t=>t.name),['get_bridge_setup','list_my_numbers','search_available_numbers']);
 assert.ok(out.result.tools.every(t=>!(/buy|route|forward|call_international/.test(t.name))));
});
test('setup is preview-only and no credentials are required',async()=>{
 const out=await dispatch(call('get_bridge_setup'),env,()=>{throw Error('should not fetch')});
 assert.equal(out.result.structuredContent.bridge_number,env.US_BRIDGE_DID);
 assert.equal(out.result.structuredContent.routing_enabled,false);
 assert.deepEqual(JSON.parse(out.result.content[0].text),out.result.structuredContent);
});
test('invalid area codes and unknown tools cannot access provider',async()=>{
 const fetcher=()=>{throw Error('unexpected fetch')};
 for(const args of [{area_code:'012'},{area_code:'618',extra:true},{area_code:618},{}])assert.equal((await dispatch(call('search_available_numbers',args),env,fetcher)).error.code,-32602);
 assert.equal((await dispatch(call('purchase_number'),env,fetcher)).error.code,-32602);
});
test('no assigned DID fails closed',async()=>{
 const out=await dispatch(call('list_my_numbers'),{},()=>{throw Error('unexpected fetch')});
 assert.equal(out.result.isError,true);
 assert.equal(out.result.structuredContent.code,'BRIDGE_NOT_ASSIGNED');
});
test('real stdio process speaks newline JSON-RPC without logging credentials',async()=>{
 const child=spawn(process.execPath,['scripts/local-number-mcp.mjs'],{env:{...process.env,US_BRIDGE_DID:env.US_BRIDGE_DID},stdio:['pipe','pipe','pipe']});
 let output='';child.stdout.on('data',chunk=>output+=chunk);
 child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:4,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}})+'\n'+JSON.stringify(call('get_bridge_setup'))+'\n');
 const code=await new Promise(resolve=>child.on('close',resolve));
 assert.equal(code,0);const lines=output.trim().split('\n').map(JSON.parse);
 assert.equal(lines.length,2);assert.equal(lines[0].result.serverInfo.name,'agentbridge-local-readonly');assert.equal(lines[1].result.structuredContent.bridge_number,env.US_BRIDGE_DID);
});

test('bounded stdio parser discards oversized lines before buffering and recovers',async()=>{
 const valid=JSON.stringify(call('get_bridge_setup'));
 const bytes=Buffer.from('x'.repeat(20000)+'\n'+valid+'\n');
 const output=[];
 for await(const item of boundedLines(Readable.from([bytes.subarray(0,5000),bytes.subarray(5000,18000),bytes.subarray(18000)])))output.push(item);
 assert.deepEqual(output,[{oversize:true},{line:valid}]);
});
test('bounded stdio parser counts UTF-8 bytes across chunk boundaries',async()=>{
 const output=[];
 for await(const item of boundedLines(Readable.from([Buffer.from('é'.repeat(2049)+'\n'),Buffer.from('{"ok":true}\n')])))output.push(item);
 assert.deepEqual(output,[{oversize:true},{line:'{"ok":true}'}]);
});
test('bounded stdio parser handles CRLF, EOF and consecutive lines',async()=>{
 const output=[];
 for await(const item of boundedLines(Readable.from([Buffer.from('{"a":1}\r\n{"b":2}\n{"c":3}')])))output.push(item);
 assert.deepEqual(output,[{line:'{"a":1}'},{line:'{"b":2}'},{line:'{"c":3}'}]);
});
