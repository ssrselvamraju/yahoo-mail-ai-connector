import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const serverPath = resolve("dist/apps/local-connector/src/stdio.js");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath, "--provider=yahoo"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const stderrChunks: Buffer[] = [];
transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

const client = new Client({ name: "yahoo-live-metadata-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  const profile = await client.callTool({ name: "get_profile", arguments: {} });
  const profileData = profile.structuredContent as Record<string, unknown> | undefined;
  if (profile.isError || profileData?.provider !== "yahoo") {
    throw new Error("Yahoo profile lookup failed.");
  }

  const mailboxes = await client.callTool({ name: "list_mailboxes", arguments: { includeCounts: false } });
  const mailboxData = mailboxes.structuredContent as Record<string, unknown> | undefined;
  if (mailboxes.isError || !Array.isArray(mailboxData?.mailboxes)) {
    throw new Error("Yahoo mailbox listing failed.");
  }

  const search = await client.callTool({
    name: "search_messages",
    arguments: { limit: 1, readState: "any" },
  });
  const searchData = search.structuredContent as Record<string, unknown> | undefined;
  if (search.isError || !Array.isArray(searchData?.messages)) {
    throw new Error("Yahoo metadata search failed.");
  }

  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  if (stderr.includes("@yahoo.")) throw new Error("The MCP server wrote an account address to stderr.");
  process.stdout.write(
    `${JSON.stringify({ ok: true, profile: true, mailboxListing: true, boundedMetadataSearch: true, bodyFetched: false, sensitiveOutputEmitted: false })}\n`,
  );
} finally {
  await client.close();
}
