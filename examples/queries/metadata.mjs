// Run from repository root after pnpm run build. Prints only bounded metadata.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
const client = new Client({ name: 'metadata-example', version: '0.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath, args: [resolve('dist/apps/local-connector/src/stdio.js'), '--provider=yahoo'],
  env: Object.fromEntries(['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : [])),
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const result = await client.callTool({ name: 'search_messages', arguments: { mode: 'history', limit: 5, before: '2025-01-01T00:00:00Z' } });
  if (result.isError) throw new Error('Metadata query failed.');
  console.log(JSON.stringify(result.structuredContent, null, 2));
} finally { await client.close(); }
