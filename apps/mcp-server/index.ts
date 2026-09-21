import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
const server=createServer();
await server.connect(new StdioServerTransport());
process.once('SIGINT',()=>{void server.close();});
process.once('SIGTERM',()=>{void server.close();});
