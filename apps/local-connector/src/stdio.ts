import { homedir } from "node:os";
import { join } from "node:path";
import { AttemptLedger, GuardedSendService } from "../../../packages/mail-send/src/service.js";
import { SmtpAdapter } from "../../../packages/mail-send/src/smtp.js";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { FakeMailProvider } from "../../../packages/mail-core/src/fake-provider.js";
import { createMailMcpServer } from "../../../packages/mcp-contract/src/server.js";
import { createRuntimeCredentialStore } from "../../../packages/yahoo-imap/src/credentials.js";
import { YahooImapProvider } from "../../../packages/yahoo-imap/src/provider.js";

const providerArgument = process.argv.find((argument) => argument.startsWith("--provider="));
const providerName = providerArgument?.slice("--provider=".length) ?? "fake";

if (providerName !== "fake" && providerName !== "yahoo") {
  console.error(`Unsupported provider for the Phase 2A server: ${providerName}`);
  process.exitCode = 2;
} else {
  const store = providerName === "yahoo" ? createRuntimeCredentialStore() : undefined;
  const provider = store ? new YahooImapProvider(store) : new FakeMailProvider();
  const enabled = providerName === "yahoo" && process.argv.includes("--enable-send");
  const send = enabled && store ? new GuardedSendService(
    () => provider.getProfile(), new SmtpAdapter(store),
    new AttemptLedger(join(homedir(), ".local", "state", "yahoo-mail-ai-connector", "send")),
  ) : undefined;
  console.error(providerName === "fake" ? "Yahoo Mail AI Connector is serving synthetic mail over stdio." : enabled ? "Yahoo Mail AI Connector is serving Yahoo Mail with guarded send enabled over stdio." : "Yahoo Mail AI Connector is serving Yahoo Mail read-only over stdio.");
  serveStdio(() => createMailMcpServer(provider, send));
}
