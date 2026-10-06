import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

function requiredArgument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value) {
    throw new Error(
      `Missing ${prefix}<value>. Use only a designated unread synthetic message with a unique subject and body canary.`,
    );
  }
  return value;
}

const subject = requiredArgument("subject");
const bodyCanary = requiredArgument("body-canary");
if (subject.length < 12 || bodyCanary.length < 12) {
  throw new Error("The synthetic subject and body canary must each be at least 12 characters to avoid accidental matches.");
}

const serverPath = resolve("dist/apps/local-connector/src/stdio.js");
const transport = new StdioClientTransport({
  // The SDK default environment omits the Linux desktop Secret Service session.
  env: Object.fromEntries(
    ["DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR"]
      .flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]!]]),
  ),
  command: process.execPath,
  args: [serverPath, "--provider=yahoo"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const stderrChunks: Buffer[] = [];
transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

const client = new Client({ name: "yahoo-live-message-smoke", version: "0.0.0" });

interface MessageSummary {
  messageRef?: unknown;
  subject?: unknown;
  isRead?: unknown;
}

function exactUnreadMatch(result: unknown): MessageSummary {
  const structured = result as { isError?: boolean; structuredContent?: { messages?: unknown } };
  if (structured.isError || !Array.isArray(structured.structuredContent?.messages)) {
    throw new Error("Yahoo synthetic-message search failed.");
  }
  const matches = (structured.structuredContent.messages as MessageSummary[]).filter(
    (message) => message.subject === subject && message.isRead === false && typeof message.messageRef === "string",
  );
  const match = matches[0];
  if (matches.length !== 1 || !match) {
    throw new Error("Expected exactly one unread synthetic message with the designated subject.");
  }
  return match;
}

async function searchDesignatedMessage(): Promise<MessageSummary> {
  return exactUnreadMatch(
    await client.callTool({
      name: "search_messages",
      arguments: { subject, readState: "unread", limit: 10 },
    }),
  );
}

try {
  await client.connect(transport);
  const before = await searchDesignatedMessage();
  const messageRef = before.messageRef as string;
  const fetched = await client.callTool({
    name: "fetch_message",
    arguments: { messageRef, bodyFormat: "text", maxBodyChars: 20_000 },
  });
  const fetchedData = fetched.structuredContent as Record<string, unknown> | undefined;
  if (
    fetched.isError ||
    fetchedData?.messageRef !== messageRef ||
    fetchedData.subject !== subject ||
    fetchedData.isRead !== false ||
    fetchedData.untrustedContent !== true ||
    typeof fetchedData.bodyText !== "string" ||
    !fetchedData.bodyText.includes(bodyCanary)
  ) {
    throw new Error("The designated synthetic message body did not match the expected bounded fetch result.");
  }

  const after = await searchDesignatedMessage();
  if (after.messageRef !== messageRef) {
    throw new Error("The designated synthetic message was not preserved as unread after fetch.");
  }

  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const expectedStartup = "Yahoo Mail AI Connector is serving Yahoo Mail read-only over stdio.";
  if (stderr.trim() !== expectedStartup) {
    throw new Error("The MCP server emitted unexpected stderr during the synthetic live-message test.");
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, exactSyntheticMatch: true, bodyCanaryMatched: true, remainedUnread: true, sensitiveOutputEmitted: false })}\n`,
  );
} finally {
  await client.close();
}
