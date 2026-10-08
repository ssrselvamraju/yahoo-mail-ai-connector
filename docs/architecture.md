# Architecture and trust boundaries

This document describes the implemented connector. Future hosted-relay ideas are intentionally kept out of the current architecture contract until they exist in code.

## Current execution modes

### Local MCP

An MCP host launches the connector as a child process over `stdio`. The connector reads the Yahoo account and app password from the native credential service selected at runtime:

- Windows Credential Manager
- macOS Keychain
- Linux Secret Service

Linux is explicitly pinned to Secret Service and does not fall back to a non-persistent kernel keyring. Unsupported platforms and unavailable credential services fail closed. Setup and credential removal happen through the separate CLI, not through MCP tools.

### Reviewed managed runtime

A runtime such as a Muse-managed VM can inject a dedicated Yahoo account and app password from its own secret store. This mode requires the explicit `YAHOO_CREDENTIAL_SOURCE=managed-environment` marker. Without that marker, the connector will not read Yahoo credentials from environment variables.

Managed mode changes the trust boundary: the runtime operator can process the credential and requested mail. Use a dedicated, independently revocable Yahoo app password and follow the [managed-VM runbook](muse-managed-vm.md).

## Data flow

```text
User request
    |
MCP host / AI client
    |  bounded MCP tool call and result
Connector process
    |  IMAP over strict TLS
Yahoo Mail
```

In local mode, credential retrieval and the Yahoo IMAP session occur on the user's machine. The Yahoo app password is supplied only to the IMAP connection and is not returned through MCP. Requested metadata or message content does return to the MCP host, which may forward it to a local or cloud model.

The connector does not operate a hosted service, emit analytics, build a background mail index, or intentionally persist message bodies. Normal operating-system memory, process inspection, crash handling, and the behavior of the MCP host remain within the user's trust boundary.

## Capability boundary

The default public MCP surface contains:

- `get_profile`
- `list_mailboxes`
- `search_messages`
- `fetch_message`
- `scan_senders`

These tools are annotated read-only and non-destructive. Yahoo mailboxes are opened read-only. Message fetches use IMAP behavior that avoids setting `\\Seen`. Search defaults to a bounded recent window and offers explicit resumable UID history traversal, returns metadata without body previews, and requires a separate bounded fetch for message text.

The local Yahoo stdio server can explicitly enable guarded plain-text SMTP send with `--enable-send`. It then exposes prepare and commit tools with write annotations; host/user confirmation, short-lived content-bound tokens, and durable replay state are required. The synthetic HTTP endpoint stays read-only. Drafting, reply threading, deleting, moving, archiving, and flag-changing tools remain absent. See [history and send](history-and-send.md) for limits and unknown-outcome handling.

## Security assumptions

- The user's operating-system account, native credential service, MCP host, and model provider are trusted according to the selected deployment.
- Email content is untrusted data and may contain prompt-injection attempts. MCP server instructions explicitly tell the host not to follow instructions found in messages without an independent user request.
- A Yahoo app password is a long-lived credential until revoked. It should be dedicated to one deployment and rotated or revoked if exposure is suspected.
- Read-only application behavior reduces impact but does not make mailbox content non-sensitive.
- Dependency and host compromise remain possible; use the committed lockfile, review updates, and keep the runtime patched.

## Verification evidence

Automated checks use the synthetic provider. Opt-in live probes verify credential storage, Yahoo TLS/authentication, read-only mailbox access, and bounded metadata operations without committing account data. See [the spike runbook](spikes/README.md), [recorded results](spikes/results.md), and [current implementation status](phase-2b-status.md).
