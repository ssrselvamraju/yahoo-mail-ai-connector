# Phase 2A spike results

Status legend: `not run`, `pass`, `fail`, `blocked`.

| Spike | Status | Evidence / blocker |
|---|---|---|
| Fake provider unit and schema tests | pass | TypeScript strict compilation succeeds; Vitest ran 4 test files and all 13 tests passed on Windows and Ubuntu. |
| MCP stdio contract smoke test | pass | The official MCP client launched the compiled server, discovered the four expected tools and read-only annotations, and successfully called `get_profile`, `search_messages`, and `fetch_message`. No synthetic body text appeared on stderr. |
| Windows credential-store probe | pass | `@napi-rs/keyring` stored, read, deleted, and confirmed deletion of a generated canary in Windows Credential Manager. The probe required an interactive user logon session; an isolated sandbox session returned `ERROR_NO_SUCH_LOGON_SESSION`, as expected. |
| macOS credential-store probe | blocked | Requires a macOS test host. |
| Linux credential-store probe | pass | Native Ubuntu desktop Secret Service stored, read, deleted, and confirmed deletion of a generated canary. No credential or canary value was printed. |
| Yahoo IMAP capability probe | pass | Live Yahoo IMAP verified on Windows: TLS was encrypted and certificate-authorized, app-password authentication succeeded, mailbox listing succeeded, Inbox opened read-only, and a server-side unread UID search completed. The report was observed in the local terminal only; account identity, mailbox names/counts, and credentials are intentionally not recorded here. |
| Yahoo OAuth feasibility | blocked | Requires the user to create or provide access to a disposable Yahoo developer application. |
| Muse Code local compatibility | blocked | Compiled-server configuration and smoke prompt are ready, but the `muse` executable is not installed on this Windows host. |
| Other client manual compatibility | not run | Run after automated contract checks pass. |

The subsequent Phase 2B stored-credential doctor and redacted live MCP metadata smoke test also pass; see [`phase-2b-status.md`](../phase-2b-status.md).

## Ubuntu verification — 2026-10-04

Verified with Node.js 24.19.0 and pnpm 11.19.0 after installing dependencies from the frozen lockfile. `pnpm run check` passed strict typechecking, all 13 tests in 4 files, compilation, and synthetic MCP stdio and HTTP contract smoke tests. Both transports discovered the four expected read-only tools. The Linux Secret Service canary lifecycle also passed. These checks did not access a Yahoo account; live Yahoo authentication, metadata, and unread-message body verification on Ubuntu remain pending.

Ubuntu interactive `connector:setup` and `connector:doctor` passed on 2026-10-06: credentials were verified and saved in Linux Secret Service, then stored-credential lookup, TLS, and Yahoo authentication passed. Account identifiers and secrets are omitted. Ubuntu live MCP metadata and designated synthetic-message body checks remain pending.

Ubuntu read-only MCP metadata verification passed on 2026-10-06 with explicit account-owner authorization: profile lookup, mailbox listing, and a bounded one-result search succeeded. No body was fetched or sensitive result printed. Linux live-smoke child processes explicitly inherit `DBUS_SESSION_BUS_ADDRESS` and `XDG_RUNTIME_DIR` to reach desktop Secret Service; the SDK default environment omits them. The designated synthetic unread-message body gate remains open.
