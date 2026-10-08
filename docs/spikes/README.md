# Phase 2A spike runbook

The spikes validate architecture risks before production implementation. All ordinary automated tests use synthetic mail.

## Prerequisites

- Node.js 22 or newer
- npm or pnpm
- Dependencies installed from the committed lockfile

## Automated fake-provider checks

```powershell
pnpm run check
```

This type-checks the workspace, runs unit tests, spawns the stdio MCP server through the official MCP client, lists its tools, verifies read-only annotations, and calls representative tools.

## OS credential-store probe

```powershell
pnpm run probe:keyring
```

The probe generates a random canary, stores it through `@napi-rs/keyring`, reads it, deletes it, and confirms it is gone. It never prints the canary. Failure is a release blocker on that operating system; there is no file-store fallback.

## Yahoo capability probe

Use a dedicated Yahoo test account containing synthetic messages only. Generate a Yahoo app password first, then run:

```powershell
pnpm run probe:yahoo -- --email=your-test-account@yahoo.com
```

The app password is entered through a hidden TTY prompt. Do not pass it as an argument, environment variable, or `.env` value. The probe:

1. Connects to `imap.mail.yahoo.com:993` with certificate validation.
2. Records advertised and enabled capabilities.
3. Lists mailboxes and counts.
4. Opens Inbox read-only.
5. Performs a server-side unread UID search.
6. Logs out.

The JSON report contains operational metadata only. Review mailbox names before sharing the report because custom folder names can themselves be sensitive.

## Designated synthetic-message fetch

This live test is deliberately separate from normal CI and the metadata-only smoke test. Send the dedicated Yahoo test account one message, leave it unread, and give it unique synthetic values such as:

- Subject: `MCP synthetic unread 7f3c91b2`
- Body: `MCP synthetic body canary 41e8d670`

Build, then provide those exact synthetic values:

```powershell
pnpm run build
pnpm run smoke:yahoo-message -- --subject="MCP synthetic unread 7f3c91b2" --body-canary="MCP synthetic body canary 41e8d670"
```

The test refuses to proceed unless it finds exactly one unread message with the exact subject. It fetches a bounded body, verifies the canary without printing the subject, body, addresses, or reference, and searches again to prove the message remained unread. The subject and canary are synthetic test data, not credentials; do not use real or sensitive mail content.

## Client compatibility

The stdio contract smoke test is client-neutral. Manual host tests follow after it passes:

1. MCP Inspector
2. Codex / VS Code
3. Claude Code / Desktop
4. Muse Code
5. Cursor

Use the synthetic provider and the same five read-only tools in every host. Record host version, negotiated MCP version, configuration, discovery result, tool result, annotations/approval behavior, stderr behavior, and any timeout.

## Yahoo OAuth feasibility

This is a documentation and disposable-app experiment only. Do not merge production OAuth code until Yahoo documents or confirms a supported mail endpoint or IMAP/SMTP token flow. Record the developer-console permissions offered, requested scopes, token claims, endpoint attempted, result, and official source. A failed OAuth spike does not block the app-password local MVP.
