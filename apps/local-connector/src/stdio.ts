import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { FakeMailProvider } from "../../../packages/mail-core/src/fake-provider.js";
import { createMailMcpServer } from "../../../packages/mcp-contract/src/server.js";
import { KeyringCredentialStore } from "../../../packages/yahoo-imap/src/credentials.js";
import { YahooImapProvider } from "../../../packages/yahoo-imap/src/provider.js";

const providerArgument = process.argv.find((argument) => argument.startsWith("--provider="));
const providerName = providerArgument?.slice("--provider=".length) ?? "fake";

if (providerName !== "fake" && providerName !== "yahoo") {
  console.error(`Unsupported provider for the Phase 2A server: ${providerName}`);
  process.exitCode = 2;
} else {
  console.error(providerName === "fake" ? "Yahoo Mail AI Connector is serving synthetic mail over stdio." : "Yahoo Mail AI Connector is serving Yahoo Mail read-only over stdio.");
  serveStdio(() =>
    createMailMcpServer(providerName === "fake" ? new FakeMailProvider() : new YahooImapProvider(new KeyringCredentialStore())),
  );
}
