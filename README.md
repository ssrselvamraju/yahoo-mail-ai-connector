# Yahoo Mail AI Connector

Give an MCP-compatible AI assistant useful, deliberately limited access to Yahoo Mail—without handing it the ability to send, delete, move, archive, or mark messages as read.

This experimental connector is built for people who want AI-assisted mail search and retrieval while keeping credential custody under their control. Run it beside a desktop client over local MCP `stdio`, or deploy it into a reviewed managed runtime such as a Muse VM using that platform's secret store.

> **Alpha / unofficial:** This project is not affiliated with or endorsed by Yahoo, Meta, OpenAI, Anthropic, or the Model Context Protocol project. It is intended for careful personal testing with read-only mail access.

## Why use this connector?

- **Read-only by construction.** The MCP surface has four tools: identify the account, list mailboxes, search message metadata, and fetch one bounded message. There are no send, reply, delete, move, archive, draft, or flag-changing tools.
- **Your normal Yahoo password is never requested.** The connector uses a separately revocable Yahoo-generated app password.
- **No plaintext credential file.** Local credentials go to Windows Credential Manager, macOS Keychain, or Linux Secret Service. If an approved credential backend is unavailable, startup fails closed.
- **Fetch only what is requested.** Searches are bounded and return metadata without downloading message bodies. A body is retrieved only through an explicit `fetch_message` call and is size-limited.
- **Portable MCP contract.** The provider-neutral tool layer is intended to behave consistently across MCP clients instead of binding mail access to one AI vendor.
- **Inspectable and testable.** The implementation, security boundary, synthetic test provider, contract tests, and live-probe procedures are included in the repository under Apache-2.0.

Yahoo-capable MCP servers already exist, including general-purpose IMAP connectors and other Yahoo-specific projects. This project does not claim to be the first or only one. Its differentiator is the specific combination of Yahoo-focused behavior, a strictly read-only tool surface, native OS credential storage with no plaintext fallback, bounded retrieval, and an explicit managed-runtime mode.

## Privacy and security boundary

In local mode, the Yahoo app password stays in the operating-system credential store and IMAP/TLS connects directly from your computer to Yahoo. The connector has no hosted backend, analytics, or telemetry, and it does not maintain a local mail index or cache message bodies.

That does **not** mean email content can never leave your computer. When you ask an AI client to search or fetch mail, the requested tool result is returned to that client. A cloud-based client or model may then process that result under its own privacy and retention terms. In a managed VM, Yahoo credentials and requested mail are processed inside that managed environment rather than on your workstation. Review and trust the MCP host, model provider, and managed runtime as well as this connector.

Security is layered rather than absolute:

1. Yahoo issues a dedicated app password that can be revoked independently.
2. The chosen OS or managed-runtime secret store protects that credential at rest.
3. Strict TLS protects the IMAP connection to Yahoo.
4. Server-side code opens mailboxes read-only and fetches bodies without setting the read flag.
5. MCP tools are annotated as read-only, return bounded data, and treat message content as untrusted input.

See [the current architecture and trust boundaries](docs/architecture.md), [design record and roadmap](docs/design-and-roadmap.md), [security policy](SECURITY.md), and [spike runbook](docs/spikes/README.md).

## What is included

The repository contains a provider-neutral contract, a synthetic provider, a read-only Yahoo IMAP provider, a local MCP server, OS-keyring setup commands, and opt-in validation probes. It does not provide mail write operations.

## Quick verification

```powershell
pnpm install --frozen-lockfile
pnpm run check
```

The checked-in Muse Code example starts the compiled server, so run `pnpm run build` before using it.

## Connect Yahoo locally

Use a Yahoo-generated app password, never the normal account password:

```powershell
pnpm run connector:setup
pnpm run connector:doctor
pnpm run mcp:yahoo
```

`connector:setup` verifies the login before saving it to the operating-system credential store. `connector:remove` deletes the saved record. The MCP server retrieves the credential only when opening a Yahoo connection and exposes read-only operations.

Native credential storage is selected from the runtime OS:

- Windows: Windows Credential Manager.
- macOS: login Keychain.
- Linux desktop: Secret Service, such as GNOME Keyring, KWallet, or a compatible provider. Secret Service is required; the connector deliberately refuses the library's non-persistent kernel-keyring fallback.
- Reviewed managed runtimes: explicit `managed-environment` mode backed by the hosting platform's secret store.

Unsupported platforms and unavailable credential services fail closed. The connector never falls back to a plaintext file.

For a Muse-managed VM or another reviewed runtime with a real managed secret store, see [the managed-VM runbook](docs/muse-managed-vm.md). Never commit Yahoo credentials or place them in a `.env` file.

## Safety status

- The default server uses synthetic messages only.
- The Yahoo probe is read-only and must be invoked explicitly.
- The keyring probe uses a generated canary and removes it after verification.
- Do not pass a Yahoo app password on the command line or put it in an environment file.

Current platform verification and remaining release gates are tracked in [Phase 2B status](docs/phase-2b-status.md) and [spike results](docs/spikes/results.md). Windows native credential storage has been exercised on a real host. macOS Keychain and Linux Secret Service still require native-host canary verification before this project claims runtime verification on those platforms.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
