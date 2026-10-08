import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const serverPath = resolve("dist/apps/local-connector/src/stdio.js");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath, "--provider=fake"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const stderrChunks: Buffer[] = [];
transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

const client = new Client({ name: "connector-contract-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const expected = ["fetch_message", "get_profile", "list_mailboxes", "scan_senders", "search_messages"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected tool list: ${JSON.stringify(names)}`);
  }

  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false) {
      throw new Error(`Tool ${tool.name} does not advertise the expected read-only annotations.`);
    }
  }

  const profile = await client.callTool({ name: "get_profile", arguments: {} });
  if (profile.isError || profile.structuredContent === undefined) throw new Error("get_profile failed.");

  const search = await client.callTool({
    name: "search_messages",
    arguments: { query: "receipt", limit: 10 },
  });
  if (search.isError || search.structuredContent === undefined) throw new Error("search_messages failed.");

  const stats = await client.callTool({ name: "scan_senders", arguments: {} });
  if (stats.isError || stats.structuredContent === undefined) throw new Error("scan_senders failed.");

  const fetched = await client.callTool({
    name: "fetch_message",
    arguments: { messageRef: "fake:inbox:102", maxBodyChars: 1_000 },
  });
  if (fetched.isError || fetched.structuredContent === undefined) throw new Error("fetch_message failed.");

  process.stdout.write(
    `${JSON.stringify({ ok: true, tools: names, stderrCleanOfSyntheticBodies: !Buffer.concat(stderrChunks).toString("utf8").includes("hotel receipt totaling") })}\n`,
  );
} finally {
  await client.close();
}
