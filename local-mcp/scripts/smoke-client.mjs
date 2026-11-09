/**
 * Manual end-to-end check: spawn the server over stdio with a real MCP client,
 * list tools/resources and call get_bridge_setup. Prints only the redacted
 * text summary (set/missing flags), never credential values.
 * Usage: node scripts/smoke-client.mjs [--live]   (--live also calls list_project_numbers)
 */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const passthrough={};
for(const k of ['SIGNALWIRE_SPACE','SIGNALWIRE_PROJECT_ID','SIGNALWIRE_API_TOKEN','US_BRIDGE_DID','AGENTBRIDGE_SECRETS_FILE','AGENTBRIDGE_NODE'])
  if(process.env[k])passthrough[k]=process.env[k];
const transport=new StdioClientTransport({command:join(here,'..','run.sh'),args:[],
  env:{...getDefaultEnvironment(),...passthrough}});
const client=new Client({name:'agentbridge-smoke',version:'0.0.0'});
await client.connect(transport);
const info=client.getServerVersion();
console.log('server:',info.name,info.version);
const {tools}=await client.listTools();
for(const t of tools)console.log('tool:',t.name,'| readOnly='+t.annotations?.readOnlyHint,'| card='+(t._meta?.ui?.resourceUri||'none'));
const {resources}=await client.listResources();
for(const r of resources)console.log('resource:',r.uri,r.mimeType);
const setup=await client.callTool({name:'get_bridge_setup',arguments:{}});
console.log('\n--- get_bridge_setup ---\n'+setup.content[0].text);
if(process.argv.includes('--live')){
  const inv=await client.callTool({name:'list_project_numbers',arguments:{}});
  console.log('\n--- list_project_numbers ---\n'+inv.content[0].text);
}
await client.close();
