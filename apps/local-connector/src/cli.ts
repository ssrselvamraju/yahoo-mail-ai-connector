import { KeyringCredentialStore } from "../../../packages/yahoo-imap/src/credentials.js";
import { verifyYahooCredentials } from "../../../packages/yahoo-imap/src/provider.js";
import { promptLine, promptSecret } from "./prompt-secret.js";

const command = process.argv[2];
const store = new KeyringCredentialStore();

async function main(): Promise<void> {
  if (command === "setup") {
    const email = await promptLine("Yahoo email address: ");
    if (!email.includes("@")) throw new Error("Enter a valid Yahoo email address.");
    let appPassword = await promptSecret("Yahoo app password (hidden): ");
    try {
      await verifyYahooCredentials({ email, appPassword });
      await store.save({ email, appPassword });
      process.stdout.write("Yahoo credentials verified and saved in the operating-system credential store.\n");
    } finally {
      appPassword = "";
    }
    return;
  }
  if (command === "doctor") {
    let credentials = await store.load();
    try {
      await verifyYahooCredentials(credentials);
      process.stdout.write("Yahoo credential lookup, TLS, and authentication passed.\n");
    } finally {
      credentials = { email: "", appPassword: "" };
    }
    return;
  }
  if (command === "remove") {
    const removed = await store.remove();
    process.stdout.write(removed ? "Yahoo credentials removed.\n" : "No stored Yahoo credentials were found.\n");
    return;
  }
  throw new Error("Usage: connector <setup|doctor|remove>");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Connector command failed."}\n`);
  process.exitCode = 1;
});
