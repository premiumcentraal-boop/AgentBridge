#!/usr/bin/env node
/** stdio entry point. stdout is reserved for MCP JSON-RPC; never log env values. */
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createServer} from './src/tools.mjs';

export const MAX_STDIN_BUFFER_BYTES=256*1024;

const {server}=createServer();
try{
  // Bound stdin buffering (a frame larger than this closes the session instead of growing memory).
  await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:MAX_STDIN_BUFFER_BYTES}));
}catch{
  process.stderr.write('agentbridge-local: failed to start stdio transport\n');
  process.exit(1);
}
