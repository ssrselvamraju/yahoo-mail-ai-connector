# Yahoo Mail AI Connector — Phase 1 Architecture and Build Plan

Status: proposed

Research date: 2026-09-28

Scope: local-first, open-source MCP connector followed by a hosted relay and, if Yahoo authentication permits, a fully hosted connector; no production mail writes in the first proof of concept

## 1. Executive decision

Build a TypeScript connector with a provider-neutral mail domain layer, a Yahoo IMAP adapter, and an MCP adapter. Define the public tool contract in the same goal-oriented style as mature Gmail/Google Workspace connectors, while keeping IMAP entirely behind the provider adapter. The first usable slice will run locally over MCP `stdio`, keep the Yahoo app password in the operating system credential store, and expose:

- `get_profile`
- `list_mailboxes`
- `search_messages`
- `fetch_message`

Use Yahoo app-password authentication for the MVP. Do not advertise Yahoo OAuth mail access yet. Yahoo's current consumer documentation explicitly supports IMAP/SMTP with an app password, while its developer documentation mentions Mail OAuth scopes but does not establish a complete, current, supported path for third-party IMAP/SMTP or a current Mail API. OAuth therefore remains a gated research spike, not a dependency of the MVP.

The delivery path has three deployment stages that share the same domain and MCP contracts:

1. **Local connector:** the AI desktop/CLI client launches the Yahoo connector over `stdio`; the app password and IMAP session stay local.
2. **Hosted relay:** ChatGPT, Claude, Muse, or another web client connects to a stable public Streamable HTTP MCP endpoint. A small local Yahoo agent maintains an outbound-only authenticated channel to the relay and performs IMAP locally. The hosted relay never stores the Yahoo app password, but it does carry requested mail results in transit and the user's local agent must be online.
3. **Fully hosted connector:** the hosted service performs Yahoo access directly and remains available when the user's computer is off. This is only acceptable after a supported Yahoo OAuth/mail authorization route or an explicitly approved credential-custody design is established.

OpenAI's Secure MCP Tunnel can test the local connector from ChatGPT without us building a relay, but it is OpenAI-specific and is not the cross-client product relay. Claude and other web clients consume a normal remote MCP endpoint. Therefore, build and test local first, then implement a vendor-neutral hosted relay, and treat fully hosted Yahoo access as the final separate security/legal gate.

## 2. Verified facts, open questions, and decisions

### Verified from current official documentation

| Topic | Finding | Architectural consequence |
|---|---|---|
| Yahoo IMAP | Yahoo documents `imap.mail.yahoo.com`, port 993, SSL required. IMAP changes sync back to the Yahoo account. | Treat even reads carefully because IMAP libraries can implicitly set `\\Seen`; use read-only mailbox access and `BODY.PEEK` semantics. |
| Yahoo SMTP | Yahoo documents `smtp.mail.yahoo.com`, port 465 or 587, SSL and authentication required. | SMTP belongs in a later write-capability module and is not loaded for the read-only MVP. |
| Yahoo credentials | Yahoo says third-party mail apps that do not use Yahoo-branded sign-in need a generated app password. App passwords remain active until deleted. | Never request the normal account password. Provide setup, verification, rotation, and removal commands. |
| Yahoo OAuth | Yahoo documents OAuth/OIDC application registration and examples of `mail-r`, but its general OAuth guide says OAuth 2.0 is currently supported by Oath Ad Platforms and UserInfo APIs. The documentation is internally inconsistent for mail. | Do not claim OAuth mail support. Validate in a disposable Yahoo developer app before designing around it. |
| MCP local transport | The official MCP TypeScript SDK documents `stdio` for local, child-process integrations and Streamable HTTP for network servers. | Use `stdio` in the local MVP and keep stdout protocol-clean. All logs go to stderr. |
| OpenAI clients | OpenAI documents Streamable HTTP for public MCP/plugin servers. Secure MCP Tunnel can bridge a private local stdio or HTTP MCP server to supported OpenAI products, but is not a public distribution mechanism. | Document two ChatGPT paths: tunnel for private development; hosted HTTPS for a distributed connector. |
| OpenAI hosted auth | Authenticated remote MCP servers are expected to implement MCP OAuth 2.1 discovery, PKCE/S256, resource binding, scope enforcement, and token validation. | A hosted service needs its own user/session authorization layer in addition to Yahoo authorization. Do not pass Yahoo app passwords through MCP. |
| Tool safety | OpenAI requires accurate `readOnlyHint`/`destructiveHint` annotations and says annotations do not replace server-side authorization and confirmation. | Enforce capabilities in code. For later consequential actions, use server-side policy plus a prepare/commit confirmation design. |
| Company knowledge | OpenAI's company-knowledge compatibility uses canonical `search` and `fetch` shapes. | Keep the mail domain API independent so a later compatibility adapter can add `search`/`fetch` without distorting mail-specific tools. |
| VS Code | VS Code supports local `stdio` configurations and Streamable HTTP. | It can run the Phase 2 package directly. |
| Cursor | Cursor documents `stdio` for local/single-user use and Streamable HTTP with OAuth for remote/multi-user use. | It can run the Phase 2 package directly. |
| Claude | Anthropic documents MCP support across Claude Desktop/Code and remote connectors for Claude.ai; cloud/research features do not uniformly invoke local servers. | Test Claude Desktop/Code with `stdio`; treat Claude.ai as a remote deployment target. |
| Muse Code | Meta's official Muse Code documentation supports local MCP over `stdio`, remote MCP over Streamable HTTP, and OAuth 2.1 login with token refresh and optional dynamic client registration. Read-only MCP tools can run without an approval prompt under its on-request approval policy. | Add Muse Code to the initial local compatibility suite and the later remote/OAuth suite. Accurate read-only annotations are required. |
| Consumer Muse / Meta AI | Meta's connector program supports API or MCP onboarding with OAuth account linking, but is currently an early-access developer preview and public publishing/discovery are not yet generally available. | Apply for early access after the local MVP is working. Do not make MVP completion depend on admission to the preview. Reuse the hosted relay MCP/OAuth endpoint if accepted. |
| Hosted relay precedent | OpenAI Secure MCP Tunnel uses an outbound HTTPS client beside a private MCP server to pull queued work, forward it locally, and return the result. Anthropic accepts public Streamable HTTP remote MCP servers with OAuth. | Use the outbound-only tunnel pattern, but expose a vendor-neutral public MCP gateway instead of coupling the product relay to one AI vendor. |

### Not established by current official documentation

- A supported, generally available Yahoo Mail REST API suitable for this connector.
- A supported Yahoo OAuth token flow for authenticating to Yahoo IMAP/SMTP with XOAUTH2.
- Numeric Yahoo IMAP/SMTP rate limits or safe concurrency limits.
- A blanket statement that publicly distributing an app-password IMAP client requires Yahoo approval.
- A blanket statement that app-password IMAP use falls under the Yahoo Developer API Terms rather than the consumer/service terms.

These must be described as unknowns, not inferred facts.

### Sources

- [Yahoo IMAP server settings](https://help.yahoo.com/kb/SLN4075.html)
- [Yahoo app-password generation and revocation](https://ca.help.yahoo.com/kb/account/generate-manage-rd-party-passwords-sln15241.html)
- [Yahoo OAuth 2.0 guide](https://developer.yahoo.com/oauth2/guide/)
- [Yahoo OpenID Connect setup mentioning Mail scopes](https://developer.yahoo.com/oauth2/guide/openid_connect/getting_started.html)
- [Yahoo Developer API Terms](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html)
- [Yahoo Developer Network Guidelines](https://legal.yahoo.com/us/en/yahoo/guidelines/ydn/index.html)
- [Official MCP TypeScript server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI MCP authentication guidance](https://developers.openai.com/plugins/build/auth)
- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol)
- [Anthropic MCP overview](https://docs.anthropic.com/en/docs/mcp)
- [Anthropic remote MCP connector requirements](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers)
- [Muse Code MCP server configuration and OAuth](https://dev.meta.ai/docs/muse-code/extending)
- [Meta AI Connectors developer preview](https://dev.meta.ai/products/connectors)

## 3. Product boundaries

### Local MVP

- One Yahoo account per connector process initially.
- Local process launched by an MCP client over `stdio`.
- Read-only IMAP behavior.
- No local full-mail index and no background synchronization.
- No mail body, attachment, or sensitive header logging.
- OS-backed credential storage, with the process retrieving the secret only when connecting.
- Explicit account setup and removal through a separate CLI, never through an MCP tool.

### Explicitly out of scope for the MVP

- SMTP, drafts, deletes, moves, flags, archive, or read/unread mutation.
- Hosted multi-tenant credential custody.
- Yahoo OAuth claims or automatic Yahoo sign-in.
- Full-text local indexing.
- Automatic attachment rendering, URL fetching, or malware scanning.
- Gmail-equivalent thread guarantees.
- Public marketplace submission.

### Hosted relay boundary

The relay is an availability bridge, not a hosted Yahoo mail backend. It is in scope immediately after the local read-only release and has these properties:

- The public endpoint is a standards-based Streamable HTTP MCP server usable by multiple AI clients.
- The local agent makes the outbound connection; the user does not open an inbound port.
- The Yahoo app password never leaves the OS credential store and is never sent to the relay or AI client.
- IMAP/TLS originates on the user's machine.
- Tool inputs and results pass through relay memory. The service must not claim end-to-end blindness because the MCP gateway terminates the AI client's authenticated request.
- The relay stores routing, account display metadata, authorization grants, request state, and audit metadata, but not message bodies or attachment bytes after the request completes.
- The user's computer and local agent must be online. Offline calls return a typed `agent_offline` result rather than being queued indefinitely.
- The first relay release is read-only. Writes require the later confirmation protocol and a fresh threat review.

### Muse compatibility path

Treat Muse Code and the consumer Muse/Meta AI connector surface as separate targets:

- **Muse Code local:** initial MVP target. Add the connector as a `stdio` MCP server in Muse Code settings. This should require no Muse-specific server implementation beyond a tested configuration file, newline-delimited JSON-RPC compatibility, clean stdout, correct annotations, and bounded tool timeouts.
- **Muse Code remote:** hosted-relay target. Add the public Streamable HTTP endpoint and exercise Muse Code's OAuth 2.1 login, refresh, logout/revocation, dynamic client registration, and 401 recovery behavior.
- **Consumer Muse / Meta AI:** gated hosted-relay target. Apply to the Meta AI Connectors developer preview with the working read-only endpoint, OAuth account linking, privacy/security documentation, and a clear Yahoo-mail use case. Run platform-specific onboarding tests only after access is granted.

The stable MCP contract must remain identical across Muse, ChatGPT, Claude, and other clients. Any Muse-specific packaging or connector metadata belongs in an adapter/manifest layer, not in the Yahoo application services.

## 4. Architecture

```text
                         Stable mail/MCP contract
              get_profile | list_mailboxes | search | fetch
                                      |
                 Application services and policy layer
                                      |
                         MailProvider interface
                                      |
                            Yahoo IMAP adapter

Local path
AI desktop/CLI --stdio--> local connector --IMAP/TLS--> Yahoo
                                     |
                                  OS keychain

Hosted relay path
AI web client --HTTPS/MCP--> public gateway --outbound channel--> local agent
                                                               |       |
                                                           OS keychain IMAP/TLS
                                                                       |
                                                                     Yahoo

Fully hosted path (gated)
AI web client --HTTPS/MCP--> hosted connector --approved Yahoo auth--> Yahoo
```

Dependency direction must point inward: Yahoo and MCP are adapters around stable application/domain contracts. No tool handler should contain raw IMAP commands, MIME parsing, credential lookup, or provider-specific mailbox rules.

### Hosted relay components

1. **Public MCP gateway**
   - Stable HTTPS `/mcp` endpoint using Streamable HTTP.
   - MCP OAuth 2.1 protected-resource and authorization-server discovery.
   - Validates issuer, audience/resource, expiry, user identity, account binding, and scopes on every request.
   - Converts each accepted MCP call into a bounded relay job and waits for a result within a short deadline.

2. **Authorization service**
   - Authenticates the user who is connecting ChatGPT, Claude, or another client.
   - Issues scoped connector tokens such as `mail.read.metadata` and `mail.read.body`.
   - Maintains the binding between user, AI-client connection, Yahoo account reference, and registered local device.
   - Is distinct from Yahoo authentication: authenticating to our MCP server does not expose the Yahoo app password.

3. **Relay broker**
   - Routes jobs to one registered device/account and correlates responses.
   - Uses an outbound-only WebSocket or long-poll HTTPS channel from the agent. Start with long-poll HTTPS for operational simplicity; add WebSocket only if latency or streaming requires it.
   - Enforces deadlines, maximum payload sizes, concurrency, cancellation, and per-user rate limits.
   - Does not persist message bodies or attachments. A job record contains only opaque IDs, timestamps, status, byte counts, and redacted error codes.

4. **Local Yahoo agent**
   - Reuses the same application services and Yahoo provider as the local `stdio` server.
   - Enrolls once using a browser/device flow, generates a non-exportable device key when the OS supports it, and receives a short-lived relay credential.
   - Authenticates the relay server, verifies the requested account and scopes, applies local policy/limits, invokes IMAP, and returns the bounded result.
   - Supports immediate unlink/revocation and shows connection/account status locally.

5. **Control plane**
   - Minimal web UI for device enrollment, connected AI clients, Yahoo account display identity, granted scopes, revocation, and security events.
   - Never accepts the Yahoo app password.

### Relay request sequence

```text
1. User installs and configures the local agent; app password enters OS keychain.
2. Agent enrolls with the relay and keeps an outbound authenticated channel open.
3. User adds https://connector.example.com/mcp to ChatGPT or Claude.
4. The AI client completes OAuth with our authorization service.
5. AI client calls search_messages with its bearer token.
6. Gateway validates token, scopes, account, schema, rate, and payload limits.
7. Broker routes an expiring job to the enrolled local agent.
8. Agent re-validates account/scope, queries Yahoo over IMAP, normalizes the result,
   and returns a bounded response.
9. Gateway returns the MCP result and discards transient mail content.
```

The relay reduces credential-custody risk, but it does not eliminate data-processing responsibility: mail queries and results traverse infrastructure we operate before reaching the AI provider. TLS, strict no-content logging, minimal transient buffering, deletion guarantees, privacy disclosures, and incident response are required.

### Recommended TypeScript stack

- Node.js active LTS, ESM, strict TypeScript.
- Official MCP TypeScript SDK and Zod for MCP schemas.
- ImapFlow for IMAP transport.
- MailParser's streaming API for MIME parsing; do not use the buffering convenience API for unbounded messages.
- Nodemailer later for SMTP.
- A `CredentialStore` interface with an OS-native implementation. Evaluate `@napi-rs/keyring`/a maintained wrapper in the Phase 2 credential spike. Fail closed if an OS keychain is unavailable; do not silently fall back to plaintext or environment variables.
- Vitest for unit/integration tests and a containerized fake IMAP server only in tests. Do not test destructive behavior against the user's real mailbox.
- Pino or a small structured logger configured with allowlisted fields and recursive redaction; stderr only under `stdio`.

Why TypeScript: the current MCP examples and schema ergonomics are strong, the official SDK directly supports both target transports, and the Node mail ecosystem supplies maintained IMAP, SMTP, and streaming MIME components. The principal risk is cross-platform native credential storage, so that is an explicit proof gate rather than an assumed dependency.

## 5. Domain model and stable identifiers

### Core normalized types

- `AccountRef`: opaque local account ID plus display-safe address.
- `Mailbox`: opaque ID, provider path, display name, delimiter, attributes, optional counts.
- `MessageRef`: opaque token containing account ID, mailbox path, IMAP `UIDVALIDITY`, and UID. It is signed or authenticated before exposure so clients cannot forge arbitrary mailbox access.
- `MessageSummary`: ref, date, normalized participants, subject, flags, size, attachment indicator, and safe preview.
- `Message`: summary plus selected headers, plain-text body, sanitized HTML-derived text when needed, and attachment metadata.
- `AttachmentRef`: opaque message-bound part identifier; never a raw filesystem path.
- `Thread`: deterministic graph/group derived from message headers, with evidence and confidence metadata.

An IMAP UID is only stable within a mailbox and a particular `UIDVALIDITY`. Never expose a UID alone as `message_id`. RFC `Message-ID` headers are useful evidence but are untrusted, can be absent, and are not a safe authorization identifier.

## 6. Phase 2 tool contracts

All schemas should reject unknown fields, set bounded string/array lengths, and return structured content plus a concise text summary.

Tool names are provider-neutral and intentionally resemble mature hosted mail connectors. Yahoo-specific mailbox and IMAP details appear only in result metadata when needed for accuracy.

### `get_profile`

Input: none.

Output:

- opaque account ID
- display-safe Yahoo address
- provider (`yahoo`)
- enabled capabilities and deployment mode (`local`, `relay`, or `hosted`)

Annotation: read-only, non-destructive. This tool lets users and AI clients distinguish multiple connected accounts without exposing credentials.

### `list_mailboxes`

Input:

- `include_counts?: boolean` (default false; counts may require extra server work)

Output:

- mailboxes with opaque ID, display name, role if confidently inferred, and safe attributes
- capability/limitation notes when counts are unavailable

Annotation: read-only, non-destructive.

### `search_messages`

Input:

- `query?: string`
- `from?: string[]`
- `to?: string[]`
- `subject?: string`
- `after?: RFC3339 date`
- `before?: RFC3339 date`
- `read_state?: "read" | "unread" | "any"`
- `has_attachment?: boolean`
- `mailbox_id?: string`
- `limit?: integer` (default 25, hard maximum 100)
- `cursor?: opaque string`

Output:

- message summaries only, ordered newest first when deterministically possible
- opaque continuation cursor
- `search_scope` and `limitations` so the model knows whether a filter was server-side, locally refined over a bounded candidate set, or unsupported

Implementation rule: compile supported filters to server-side IMAP SEARCH and fetch only the metadata required for candidates. Never download an entire mailbox to satisfy a query. Capability-probe Yahoo at connection time, bound any client-side refinement, and return an explicit partial/unsupported result rather than silently scanning without limit.

### `fetch_message`

Input:

- `message_ref: string`
- `body_format?: "text" | "metadata_only"` (default text)
- `max_body_chars?: integer` (bounded by server policy)

Output:

- normalized metadata
- bounded plain text with truncation metadata
- attachment metadata only
- a clear label that email content is untrusted data and may contain instructions that must not override the user's request

Implementation rule: open the mailbox read-only and fetch without setting `\\Seen`. Do not return raw HTML in the default response, resolve remote images, follow links, or retrieve attachment bytes.

### `fetch_messages_batch` (Phase 4)

Accept a bounded list of opaque message references and return per-item success/error results. This reduces repeated remote round trips in the hosted relay without permitting arbitrary bulk mailbox export. Enforce a small maximum item count and aggregate response-byte ceiling.

### Later OpenAI/GWS-style compatibility adapter

After the mail-specific tools are stable, add canonical read-only `search` and `fetch` aliases with user-openable Yahoo web links where reliable. Keep them as an adapter over the same application services, not a second search implementation.

## 7. Search and threading design

### Search

1. Discover and cache session capabilities, without assuming Yahoo supports optional IMAP extensions.
2. Resolve mailbox IDs through an allowlisted mapping.
3. Compile filters to IMAP SEARCH terms.
4. Fetch only UIDs plus necessary envelope/flag/structure fields.
5. Apply bounded local refinement only when explicitly reported.
6. Return stable opaque refs and a cursor tied to account, mailbox, query hash, and expiry.

Cursor integrity matters: sign cursors and reject cross-account or modified cursors. Search results can change between pages, so document pagination as best-effort rather than a snapshot unless a bounded UID result set is captured.

### Thread reconstruction (Phase 4)

- Normalize `Message-ID`, `In-Reply-To`, and `References` conservatively.
- Create parent edges only from valid header evidence.
- Use subject similarity only as an optional grouping hint, never proof of parentage.
- Handle missing, duplicate, malformed, and cyclic IDs.
- Return `thread_basis`/confidence and allow singleton threads.
- Scope reconstruction to fetched results or a bounded query; do not create a hidden full-mail index in Phase 4.

## 8. Security and threat model

| Threat | Required control |
|---|---|
| Normal Yahoo password collection | Setup UI and docs ask only for a generated app password; reject language suggesting the normal password. |
| Credential leakage in logs/errors | Secret types are never serializable; logger uses allowlisted fields and redaction; tests seed canary secrets and scan stdout, stderr, snapshots, and thrown errors. |
| Secret exposure through MCP | Account setup/removal are out-of-band CLI commands. No MCP tool accepts, returns, or enumerates credentials. |
| Plaintext storage | OS credential backend only; restrictive non-secret config permissions; fail closed when no approved keychain is available. |
| Prompt injection in email | Treat subjects, bodies, headers, filenames, and links as hostile content. Label provenance, strip active HTML, never execute/fetch, and keep server instructions outside retrieved content. |
| Implicit read-state mutation | Read-only mailbox selection plus peek fetches; integration test that `fetch_message` does not add `\\Seen`. |
| Oversized/MIME bombs | Byte, part-count, nesting-depth, decompression, time, and output limits; stream data; abort safely. |
| Path traversal via attachment names | Never use sender-supplied filenames as paths; sanitize display names and use generated storage names if export is later added. |
| Cross-account confused deputy | Bind every opaque reference and cursor to the authenticated account and capability set. |
| Forged or stale identifiers | Authenticate opaque refs; validate mailbox, `UIDVALIDITY`, UID, and account on every call. Return a typed stale-reference error. |
| Unauthorized write | Separate read and write capabilities in configuration and code. SMTP module is absent from the Phase 2 runtime. |
| Accidental send/delete later | Use `prepare_*` followed by a short-lived, content-bound `commit_*` token for sends/destructive actions, in addition to MCP annotations and host approval. Use idempotency keys. |
| Network interception | TLS required; certificate validation cannot be disabled by configuration. |
| Resource abuse/account lockout | Low connection concurrency, bounded searches, timeouts, exponential backoff with jitter, and circuit breaking on authentication failures. |
| Local process compromise | Document that any process running as the same OS user may be inside the local trust boundary; minimize credential lifetime and package supply-chain surface. |
| Relay tenant mix-up | Bind OAuth subject, connector account, registered device, job, cursor, and message reference cryptographically; authorize at gateway and again at the agent. |
| Forged/replayed relay jobs | Sign/authenticate channel messages, use unique job IDs, short expirations, monotonic/replay state, and single-use result acceptance. |
| Stolen device credential | Store device keys in the OS keychain or hardware-backed store when available; use short-lived credentials, rotation, immediate server-side revocation, and device inventory. |
| Relay content retention | Keep tool payloads in transient memory only where practical; prohibit content in durable queues, logs, traces, crash reports, and analytics; enforce deletion and TTL tests. |
| Compromised relay or agent update | Signed releases, provenance, SBOM, pinned update channel, rollback, least-privilege runtime, and independent agent-side authorization. |

Suggested capability policy:

- `mail.read.metadata`
- `mail.read.body`
- `mail.read.attachments`
- `mail.modify`
- `mail.send`

Do not conflate `mail.search` with a separate security boundary if search results contain the same metadata as read operations. Capabilities are enforced by the application service, not just advertised in MCP metadata.

## 9. Repository layout

```text
/
├─ apps/
│  ├─ local-connector/       # setup CLI, stdio MCP entrypoint, local agent mode
│  │  └─ src/
│  └─ relay-gateway/         # public MCP endpoint, OAuth, broker, control plane
│     └─ src/
├─ packages/
│  ├─ mail-core/             # provider-neutral models, services, policy, errors
│  ├─ yahoo-provider/        # IMAP connection, search compiler, MIME normalization
│  ├─ mcp-contract/          # stable tools, schemas, annotations, result shapes
│  ├─ local-security/        # OS keychain, opaque references, redaction, limits
│  ├─ relay-protocol/        # jobs, device enrollment, channel and error contracts
│  └─ observability/         # privacy-safe logger and metrics
├─ tests/
│  ├─ unit/
│  ├─ contract/
│  ├─ integration/
│  ├─ relay/
│  ├─ fixtures/          # synthetic mail only
│  └─ security/
├─ docs/
│  ├─ phase-1-plan.md
│  ├─ setup.md
│  ├─ architecture.md
│  ├─ security.md
│  ├─ relay.md
│  ├─ client-setup/
│  └─ hosted-service.md
├─ examples/
│  └─ client-configs/    # no credentials; ChatGPT, Claude, Muse Code, VS Code, Cursor
├─ package.json
├─ tsconfig.json
├─ LICENSE
├─ SECURITY.md
├─ CONTRIBUTING.md
├─ .env.example          # non-secret options only
└─ README.md
```

Avoid a `.env` credential workflow. If `.env.example` exists, it should contain only non-secret tuning such as log level and message-size limits.

## 10. Delivery plan and gates

### Phase 1 — architecture (this document)

Exit criteria:

- Facts are separated from assumptions.
- Local and hosted trust boundaries are distinct.
- Four read-only MVP tools have bounded contracts.
- Yahoo OAuth is explicitly gated on proof.
- Security controls and failure behavior are testable.

### Phase 2A — technical spikes

Build disposable, non-product spikes and record results:

1. **Yahoo capability probe:** TLS login with app password, CAPABILITY, mailbox listing, server-side search, metadata fetch, body peek, logout. Record capabilities without message content.
2. **Credential-store probe:** install/store/read/delete on Windows, macOS, and Linux CI or documented manual test hosts. Confirm no plaintext fallback.
3. **MCP compatibility probe:** run a no-mail fake provider through Inspector, Codex/VS Code, Claude Code/Desktop, Muse Code, and Cursor using `stdio`; test Streamable HTTP separately against ChatGPT, Claude, and Muse Code remote-connector requirements.
4. **OAuth feasibility probe:** create a Yahoo developer application and determine whether current application permissions and tokens can authenticate to a documented mail endpoint or IMAP/SMTP. Stop if official support cannot be confirmed.

Gate: do not start the product implementation until spikes 1–3 pass. OAuth spike 4 may fail without blocking the app-password MVP; its result must be documented.

### Phase 2B — read-only vertical slice

1. Scaffold TypeScript package, linting, tests, license, security policy, and release scripts.
2. Implement setup/doctor/removal CLI and OS credential store.
3. Implement provider interface plus Yahoo connection lifecycle.
4. Implement normalized mailbox and message models.
5. Implement the four application services.
6. Register the four MCP tools over `stdio`.
7. Add fixtures and fake provider for deterministic tests.
8. Add opt-in live Yahoo smoke tests that never mutate and never run in normal CI.
9. Write setup guides and client configuration examples.
10. Add a Muse Code local configuration example and automated/headless smoke prompt using only the fake provider and synthetic mail fixtures.

Release gate for `0.1.0`:

- Fresh clone to first successful query is documented and reproducible.
- No normal password or secret is accepted by MCP tools.
- Canary credentials never appear in stdout/stderr/errors/snapshots.
- `fetch_message` provably does not mark unread mail as read.
- Search is bounded and reports unsupported/partial filters.
- Timeouts, auth failures, stale refs, malformed MIME, and oversized messages produce typed, non-secret errors.
- Muse Code discovers the same four tools over `stdio`, calls read-only tools with the expected annotations, and passes the common contract suite without Muse-specific tool forks.

### Phase 3 — read-only hosted relay

1. Extract and version `mcp-contract` and `relay-protocol` packages.
2. Build the public Streamable HTTP MCP gateway with the same four tool contracts.
3. Integrate an established OAuth 2.1 identity/authorization provider rather than writing password login or token issuance from scratch.
4. Implement device enrollment, short-lived agent credentials, rotation, unlinking, and account binding.
5. Implement an outbound long-poll HTTPS channel, expiring jobs, cancellation, deadlines, and offline detection.
6. Add local-agent relay mode that reuses the exact Yahoo provider/application services used by `stdio`.
7. Test with ChatGPT, Claude, and Muse Code remote connectors, plus a generic MCP client.
8. Apply for the Meta AI Connectors developer preview and, if admitted, validate the same endpoint in consumer Muse/Meta AI without blocking the relay release on preview availability.

Relay release gate for `0.2.0`:

- The relay never receives or stores the Yahoo app password.
- A token for user/account A cannot route work to user/account B.
- A disconnected or revoked device cannot receive jobs or submit results.
- Mail bodies and attachment bytes are absent from databases, queues, logs, traces, crash reports, and analytics.
- Jobs expire quickly and are not executed after the calling MCP request is cancelled or timed out.
- The local agent independently enforces scopes, account binding, size limits, and read-only policy.
- Offline behavior is explicit and does not queue private mail work indefinitely.
- ChatGPT, Claude, and Muse Code can call the same public `/mcp` endpoint through their supported OAuth flows.
- Consumer Muse/Meta AI testing is recorded when preview access is available; lack of admission is documented as an external availability constraint, not treated as an implementation failure.

### Phase 4 — richer read experience

- Thread reconstruction with evidence/confidence.
- Attachment listing and explicit, bounded retrieval.
- Better cursors and search refinement.
- Optional canonical `search`/`fetch` adapter for OpenAI company-knowledge style retrieval.
- Multiple local accounts with an explicit, non-ambiguous account selector.
- Bounded `fetch_messages_batch` optimized for remote round trips.

### Phase 5 — controlled writes

- Add provider methods for draft, move/archive, flags, trash, and SMTP send.
- Verify Yahoo semantics empirically, especially Sent/Drafts behavior and UID changes after moves.
- Add granular capabilities.
- Add prepare/commit workflows and idempotency for send/delete.
- Ship write features disabled by default and enable them per account.

Do not model `delete_message` as immediate permanent deletion. Prefer move-to-trash when Yahoo exposes an identifiable trash mailbox; permanent expunge should be a separate, clearly destructive capability, if offered at all.

### Phase 6 — packaging and distribution

- Publish signed npm provenance/artifacts and checksums.
- Supply SBOM and dependency/vulnerability automation.
- Provide configs for major local clients.
- Add upgrade/migration and incident-response docs.
- Run external security review before enabling writes by default.

### Phase 7 — fully hosted Yahoo connector (separate gated track)

This is different from the relay: Yahoo access originates in our infrastructure and works while the user's device is offline. Before implementation, require:

- Confirmed Yahoo-approved authentication route; do not centrally warehouse app passwords as the default design.
- Yahoo terms/approval and commercialization review by counsel or Yahoo.
- MCP OAuth 2.1 authorization server or established identity provider, including PKCE, discovery, audience/resource binding, rotation, and revocation.
- Tenant isolation, envelope encryption with managed KMS/HSM, audited operator access, deletion/export workflows, breach response, abuse controls, and privacy policy.
- Stable public HTTPS Streamable HTTP endpoint, rate limiting, availability targets, and marketplace-specific review.
- Data-flow analysis covering what mail data is transmitted to each AI host and what that host retains.

The preferred fully hosted design uses a Yahoo-supported, revocable OAuth mail grant with the narrowest available scopes. Centrally stored app passwords are not the default fallback; adopting that model would require explicit product approval, legal review, external security review, strong encrypted secret custody, and clear disclosure that Yahoo app passwords are long-lived and not granularly scoped.

Yahoo's API terms reserve rate limiting discretion, impose data/privacy duties, and include restrictions relevant to commercial use of Yahoo APIs. Whether and how those terms apply to an IMAP-based product needs legal review; do not represent this plan as legal approval.

## 11. Test strategy

### Unit

- Search compiler property tests and injection-resistant escaping.
- MIME parsing: multipart alternatives, encodings, malformed headers, nested messages, inline parts, duplicate IDs, and size/depth limits.
- Thread graph: missing/duplicate/cyclic `Message-ID`, `References`, and `In-Reply-To`.
- Opaque refs/cursors: tampering, expiry, wrong account, wrong mailbox, changed `UIDVALIDITY`.
- Redaction: app-password canaries in nested errors and library error shapes.
- Capability policy and schema boundary tests.

### Contract

- Every tool's JSON schema, structured output, annotations, error codes, truncation markers, and unknown-field rejection.
- MCP stdout contains protocol frames only.
- Fake provider verifies tool handlers cannot bypass application policy.

### Integration

- Synthetic IMAP server for mailbox, search, fetch, disconnect, timeout, malformed MIME, and authentication cases.
- Assert body fetch uses non-mutating semantics.
- OS credential backend store/read/delete tests on each supported platform.
- MCP Inspector tests for both transports.

### Relay

- OAuth discovery, PKCE, audience/resource, scope, expiry, refresh, revocation, and cross-client callback tests.
- Device enrollment, rotation, unlink, duplicate device, stolen credential, and offline/reconnect tests.
- Cross-tenant/account routing isolation and forged/replayed/expired job tests.
- Cancellation, timeout, retry, duplicate delivery, result idempotency, backpressure, and payload-limit tests.
- Automated scans proving synthetic mail canaries never reach durable storage or observability systems.
- End-to-end remote MCP tests against ChatGPT and Claude test connections using only a synthetic Yahoo test account.
- Muse Code local and remote tests: stdio framing, tool discovery, read-only annotations, OAuth login/refresh/logout, DCR on/off, 401 recovery, and headless execution.
- Consumer Muse/Meta AI connector onboarding and invocation tests when developer-preview access is granted.

### Manual live smoke tests

- Dedicated Yahoo test account containing synthetic messages only.
- App-password creation, verification, revocation, and auth-failure backoff.
- Yahoo capability snapshot and special-folder mapping.
- End-to-end queries in each supported client.

## 12. Remaining product decisions

These do not block the architecture, but should be chosen before `0.1.0` packaging:

1. Project name and package scope. Avoid Yahoo trademarks in a way that implies endorsement; use a descriptive subtitle and disclaimer.
2. Supported OS matrix for the first release. Windows/macOS/Linux support depends on the credential-store spike.
3. License (MIT is a simple default; Apache-2.0 offers an explicit patent grant).
4. Whether Phase 4 attachment retrieval returns MCP embedded resources, writes to an explicitly selected local directory, or supports both.
5. Whether OpenAI Secure MCP Tunnel setup is documented as an advanced development path in `0.1.x` or deferred until the read-only core is stable.
6. Relay hosting region/provider, identity provider, retention guarantees, and whether the control plane is open source in the same repository.
7. Meta AI Connectors developer-preview admission and any connector-specific review, manifest, branding, or action-confirmation requirements disclosed during onboarding.

## 13. Recommended immediate next step

Approve this architecture, then execute only the four Phase 2A spikes. The first implementation PR should contain spike reports, a fake-provider MCP server, and local compatibility checks for Muse Code alongside the other desktop clients; it should not yet contain SMTP, destructive tools, hosted auth, or production Yahoo OAuth code. After the local `0.1.0` release gate passes, begin the read-only relay as `0.2.0`; do not combine local IMAP validation and public relay authentication into one initial milestone. Apply for Meta AI Connectors preview access once the read-only local demo is credible, but keep that external review off the MVP critical path.
