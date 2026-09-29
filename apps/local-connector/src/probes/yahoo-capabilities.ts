import { ImapFlow } from "imapflow";
import { promptLine, promptSecret } from "../prompt-secret.js";

const emailArg = process.argv.find((argument) => argument.startsWith("--email="));

async function main(): Promise<void> {
  const email = emailArg?.slice("--email=".length) || (await promptLine("Yahoo email address: "));
  if (!email.includes("@")) throw new Error("Enter a valid Yahoo email address.");
  let appPassword = await promptSecret("Yahoo app password (hidden): ");
  if (appPassword.length < 8) throw new Error("The app password is unexpectedly short.");

  const client = new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    emitLogs: false,
    logRaw: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    maxLineLength: 1024 * 1024,
    maxLiteralSize: 8 * 1024 * 1024,
    maxResponseSize: 10 * 1024 * 1024,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
  });

  try {
    await client.connect();
    const listed = await client.list({ statusQuery: { messages: true, unseen: true } });
    const inbox = listed.find((mailbox) => mailbox.path.toLocaleUpperCase() === "INBOX");
    let unreadSearchCount: number | undefined;
    if (inbox) {
      const lock = await client.getMailboxLock(inbox.path, { readOnly: true, acquireTimeout: 10_000 });
      try {
        const matches = await client.search({ seen: false }, { uid: true });
        unreadSearchCount = Array.isArray(matches) ? matches.length : undefined;
      } finally {
        lock.release();
      }
    }

    const report = {
      ok: true,
      endpoint: "imap.mail.yahoo.com:993",
      tls: { encrypted: client.secureConnection, authorized: client.tls ? client.tls.authorized : undefined },
      capabilities: [...client.capabilities.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name)),
      enabled: [...client.enabled].sort(),
      mailboxCount: listed.length,
      mailboxes: listed.map((mailbox) => ({
        path: mailbox.path,
        specialUse: mailbox.specialUse,
        messages: mailbox.status?.messages,
        unseen: mailbox.status?.unseen,
      })),
      unreadSearchCount,
      checks: { authenticated: true, listedMailboxes: true, openedInboxReadOnly: Boolean(inbox), serverSideUnreadSearch: unreadSearchCount !== undefined },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    appPassword = "";
    if (!client.isClosed) await client.logout().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Yahoo probe error";
  process.stderr.write(`Yahoo capability probe failed: ${message}\n`);
  process.exitCode = 1;
});
