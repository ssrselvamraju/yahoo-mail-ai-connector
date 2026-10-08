import { once } from "node:events";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createSyntheticHttpServer } from "../../apps/remote-connector/src/http.js";

const configuredEndpoint = process.env.MCP_HTTP_ENDPOINT;
const server = configuredEndpoint ? undefined : createSyntheticHttpServer();
if (server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
const address = server?.address();
if (!configuredEndpoint && (typeof address !== "object" || address === null)) {
  throw new Error("Synthetic HTTP server did not expose a TCP address.");
}
const endpoint = new URL(configuredEndpoint ?? `http://127.0.0.1:${(address as { port: number }).port}/mcp`);
const transport = new StreamableHTTPClientTransport(endpoint);
const client = new Client({ name: "connector-http-contract-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const expected = ["fetch_message", "get_profile", "list_mailboxes", "scan_senders", "search_messages"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`Unexpected HTTP tool list: ${JSON.stringify(names)}`);
  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false) {
      throw new Error(`HTTP tool ${tool.name} does not advertise the expected read-only annotations.`);
    }
  }
  const result = await client.callTool({ name: "search_messages", arguments: { query: "receipt", limit: 10 } });
  if (result.isError || result.structuredContent === undefined) throw new Error("HTTP search_messages failed.");
  process.stdout.write(`${JSON.stringify({ ok: true, endpoint: endpoint.toString(), provider: "synthetic", tools: names })}\n`);
} finally {
  await client.close();
  if (server) {
    server.close();
    await once(server, "close");
  }
}
