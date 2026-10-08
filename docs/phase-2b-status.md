# Phase 2B read-only vertical slice status

Status: implementation in progress

## Implemented

- Yahoo app-password records stored in Windows Credential Manager, macOS Keychain, or Linux Secret Service according to the runtime OS; no plaintext fallback. Linux is pinned to persistent Secret Service and does not silently fall back to the in-memory kernel keyring.
- Out-of-band `setup`, `doctor`, and `remove` commands.
- Strict-TLS Yahoo IMAP connection with bounded time, line, literal, and response sizes.
- Read-only Yahoo implementations of profile, mailbox listing, bounded single-mailbox search, and message fetch.
- Opaque mailbox, message, and attachment references with UIDVALIDITY checks for stale message references.
- Read-only mailbox locks and bounded source/MIME parsing.
- The existing provider-neutral MCP contract and synthetic provider remain unchanged.

## Verified

- TypeScript strict compilation.
- Original read-only baseline: 4 files, 13 tests. The history/send bundle has 8 files and 32 tests.
- Synthetic-provider MCP stdio contract smoke test.
- Live Yahoo TLS, authentication, mailbox listing, read-only Inbox open, and server-side search capability probe.
- Windows Credential Manager and native Ubuntu Linux Secret Service canary lifecycles.
- Ubuntu synthetic verification with Node.js 24.19.0 and pnpm 11.19.0: strict typechecking, all 13 unit/schema tests, compilation, and stdio/HTTP contract smoke tests (2026-10-04).
- Stored-credential `doctor` check for keychain retrieval, strict TLS, and Yahoo authentication on Windows and Ubuntu. Ubuntu interactive setup and doctor passed with Linux Secret Service (2026-10-06).
- Redacted live MCP test on Windows and Ubuntu for profile, mailbox listing, and bounded one-result metadata search; no message body was fetched and no account/mail metadata was emitted.

- Ubuntu designated synthetic-message `smoke:yahoo-message` passed (2026-10-06): exact unread match, bounded body canary match, and a second search proving the message remained unread; no sensitive output emitted.
- Codex local Yahoo MCP discovery and read-only search/fetch were confirmed by the account owner in a fresh chat (2026-10-06).

## Remaining gates

- Complete Muse Code local host testing when Muse Code is installed. Muse managed-VM setup is reported complete and its sanitized setup lessons are recorded in `muse-managed-vm.md`; that separate deployment does not establish Muse Code local-host compatibility.
- Add native macOS credential-backend verification. Linux Secret Service has passed the native Ubuntu canary probe; Ubuntu live MCP metadata checks pass; the designated synthetic-message body check also passes.

## History and guarded-send build — 2026-10-07

Implemented resumable UID history search, exact arrival-date filtering, envelope-only sender statistics, and opt-in local plain-text SMTP send with prepare/confirm, durable replay state, and conservative unknown-outcome handling. Typechecking, 32 tests, build, and synthetic stdio/HTTP contract checks pass. Local SMTP sink verifies Bcc envelope/header separation and lost-acknowledgement behavior. Default startup remains read-only and adds `scan_senders`; send requires `--enable-send`. A live Yahoo send through Codex was confirmed by the account owner on 2026-10-07. Sent-folder behavior and native Windows/macOS send-ledger durability remain unverified. See [usage and limits](history-and-send.md).
