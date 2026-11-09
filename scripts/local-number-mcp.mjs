#!/usr/bin/env node
/** Private, single-operator, read-only MCP stdio adapter. No telephony routes. */
import {createInterface} from 'node:readline';
import {getBridgeSetup,listMyNumbers,searchAvailableNumbers} from '../backend/src/chat-number-tools.mjs';

const MAX_LINE=4096;
const TOOLS=[
  {name:'get_bridge_setup',description:'Read-only preview of configured US bridge DID; does not activate calling.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'list_my_numbers',description:'Read-only check of the single configured DID in the operator SignalWire Project.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'search_available_numbers',description:'Read-only search of up to five unreserved US local numbers; no prices or purchases.',inputSchema:{type:'object',properties:{area_code:{type:'string',pattern:'^[2-9][0-9]{2}$'}},required:['area_code'],additionalProperties:false}}
];
const PROTOCOL='2025-06-18';
function respond(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');}
function reject(id,code,message){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})+'\n');}
function account(env){return {id:'local-operator',did:env.US_BRIDGE_DID,status:'active'};}
function isObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function empty(x){return x===undefined||(isObject(x)&&Object.keys(x).length===0);}
export async function dispatch(message,env=process.env,fetchImpl=fetch){
  if(!isObject(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {error:{code:-32600,message:'Invalid Request'}};
  const {method,params}=message;
  if(method==='initialize')return {result:{protocolVersion:PROTOCOL,capabilities:{tools:{listChanged:false}},serverInfo:{name:'agentbridge-local-readonly',version:'0.1.0'}}};
  if(method==='ping')return {result:{}};
  if(method==='notifications/initialized')return {notification:true};
  if(method==='tools/list')return empty(params)?{result:{tools:TOOLS}}:{error:{code:-32602,message:'Invalid params'}};
  if(method!=='tools/call')return {error:{code:-32601,message:'Method not found'}};
  if(!isObject(params)||typeof params.name!=='string'||!TOOLS.some(t=>t.name===params.name)||!isObject(params.arguments)||Object.keys(params).some(k=>!['name','arguments'].includes(k)))return {error:{code:-32602,message:'Invalid params'}};
  const args=params.arguments;
  if(params.name==='search_available_numbers'?(Object.keys(args).length!==1||typeof args.area_code!=='string'||!/^[2-9]\d{2}$/.test(args.area_code)):Object.keys(args).length!==0)return {error:{code:-32602,message:'Invalid params'}};
  const a=account(env);
  let response;
  if(params.name==='get_bridge_setup')response=getBridgeSetup(a,env);
  else if(params.name==='list_my_numbers')response=await listMyNumbers(a,env,fetchImpl);
  else response=await searchAvailableNumbers(a,args,env,fetchImpl);
  const data=response.body;
  return {result:{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,isError:response.status>=400}};
}
export async function start(input=process.stdin,env=process.env,fetchImpl=fetch){
  const lines=createInterface({input,crlfDelay:Infinity});
  for await(const line of lines){
    if(Buffer.byteLength(line,'utf8')>MAX_LINE){reject(null,-32700,'Message too large');continue;}
    let msg;
    try{msg=JSON.parse(line);}catch{reject(null,-32700,'Parse error');continue;}
    const id=isObject(msg)&&Object.hasOwn(msg,'id')?msg.id:null;
    let out;
    try{out=await dispatch(msg,env,fetchImpl);}catch{out={error:{code:-32603,message:'Internal error'}};}
    if(out.notification||id===null)continue;
    if(typeof id!=='string'&&typeof id!=='number'){reject(null,-32600,'Invalid Request');continue;}
    if(out.error)reject(id,out.error.code,out.error.message);
    else respond(id,out.result);
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)start().catch(()=>{process.exitCode=1;});
