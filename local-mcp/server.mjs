#!/usr/bin/env node
/** stdio entry point. stdout is reserved for MCP JSON-RPC; never log env values. */
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createServer} from './src/tools.mjs';

const {server}=createServer();
try{
  await server.connect(new StdioServerTransport());
}catch{
  process.stderr.write('agentbridge-local: failed to start stdio transport\n');
  process.exit(1);
}
