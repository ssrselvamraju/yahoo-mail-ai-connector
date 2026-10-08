# History search, sender statistics, and guarded send

## Read-only history

`search_messages` retains recent mode by default: filters apply to the newest 1,000 messages of one mailbox. Numeric cursors remain compatible in recent mode. Date filters in recent mode do not escape that scope.

Use `mode: "history"` to traverse older IMAP-visible mail. Optional `uidAfter` and `uidBefore` are exclusive bounds; supplying either also selects UID traversal. Each invocation scans at most four 250-UID intervals, returns at most the requested `limit`, and has a 15-second traversal deadline. UID ranges can contain gaps; 1,000 UID values need not represent 1,000 messages.

Repeat the same arguments with `nextCursor` until `complete` is true. An empty page with a cursor is not the end of the search. Cursors bind account, mailbox, UIDVALIDITY, filters, result limit, and the original UID ceiling; new arrivals above that ceiling are excluded. Expunged messages disappear naturally. Cursors expire after 30 minutes and do not survive server restart. Changing arguments or UIDVALIDITY requires a fresh search.

Dates refer to IMAP internal arrival time. Server searches widen day-granular date ranges and fetched metadata is filtered against exact timestamp boundaries. Every history call remains partitioned by UID, even for a dense date range; monthly splitting is unnecessary for this bounded traversal. Searches return summaries without fetching bodies. Arbitrarily large mailbox traversals require repeated client calls.

`scan_senders` returns one page of envelope-only sender-domain statistics, up to 100 messages and 100 domains. `sampleSubjects` defaults to zero and can request up to three bounded subjects per domain. Each message counts once for every distinct sender domain; missing senders fall under `(unknown)`. Domain counts cover that page only. Sum pages to cover the traversed scope; if there are more than 100 distinct domains in a page, rare domains are omitted and results are not a complete histogram. No bodies, body structures, or flags are downloaded for this tool.

The connector's recent limit is confirmed in code. Reports of approximate Yahoo mailbox visibility or SEARCH result ceilings are deployment observations, not universal guarantees. This version does not claim that old mail is available only in a browser.

For an operator example, build and run `node examples/queries/metadata.mjs` from the repository root. It prints bounded live metadata: keep its output private and do not copy it into logs, fixtures, or issues.

## Guarded local plain-text send

Direct server launches leave send disabled unless `--enable-send` is supplied. The default repository client configurations include this flag for live Yahoo; matching `.fake` examples remain read-only. Supply `--enable-send` when launching the **local Yahoo stdio server** to advertise `mail.send` and expose `prepare_send_message` and `commit_send_message`. Keep the usual read-only configuration for everyday read-only use. The fake provider and synthetic HTTP endpoint never expose send.

This initial send slice supports plain-text body, subject, To, Cc, and Bcc. It does not support attachments, reply threading, drafts, or mailbox mutation. ASCII addr-spec addresses only; at most 10 recipients in total, a 500-character subject without control characters, and a 50,000-byte body. Unsupported fields are rejected.

Preparation validates content, contacts no SMTP server, and returns the exact preview, a digest, a random single-use token, and five-minute expiry. Show the entire preview, including Bcc, to the user. Commit takes `token`, `previewDigest`, an `idempotencyKey` of 16–128 characters, and `confirmed: true`. It cannot accept changed mail content. Any content change requires a fresh preview and confirmation.

The MCP host must obtain independent user confirmation before calling commit. The confirmation field records the host's assertion; the server cannot prove a human clicked approval. Write/destructive annotations request host approval but do not replace the host's confirmation policy. Email text cannot supply user approval. Tokens are process-local and preparations do not survive restart.

The production adapter uses smtp.mail.yahoo.com:465 with certificate validation and TLS 1.2 or newer, retrieves the existing app password from the approved credential store, disables raw logging and URL/file content access, and uses a 45-second overall submission deadline. It strips Bcc headers while keeping Bcc recipients in the SMTP envelope. Commit results expose counts and a generated Message-ID, not addresses or server responses. SMTP acceptance does not prove final delivery or Sent-folder behavior; a live Yahoo send through Codex was confirmed by the account owner on 2026-10-07, while automatic Sent storage remains unverified.

## Replay state and unknown outcomes

The private local ledger is `~/.local/state/yahoo-mail-ai-connector/send`, mode 0700 with files mode 0600. It contains only hashed keys/token identifiers, generated Message-IDs, timestamps, and outcomes. Mail bodies, subjects, addresses, credentials, and raw tokens remain absent. Native durable ledger verification currently targets Ubuntu; do not claim Windows/macOS send support without filesystem durability tests.

The ledger is written and synced before SMTP submission. A duplicate key and preparation returns the saved outcome without SMTP; reusing the token with another key is rejected. A process restart invalidates preparation tokens, so an old commit is rejected rather than submitted again. A crash after an attempt starts leaves `unknown`. Rate limits are one attempt per minute and five per hour across the ledger, and a process allows one active commit. Ledger capacity is capped at 10,000 attempt records; it is never automatically pruned.

An unknown outcome blocks further new submissions until the operator inspects and resolves the state. A stale `.lock` also fails closed and requires inspection. Do not simply delete records or create a new preparation to retry uncertain delivery: SMTP may already have accepted it. There is no automated reconciliation workflow in this slice. Replay protection prevents repeated submission of the same preparation; it cannot prevent a user from deliberately preparing an equivalent new message after manually bypassing the ledger.

A separate plaintext SMTP sink is used only by synthetic tests through dependency injection. Production startup exposes no plaintext or endpoint override. Tests verify envelope/header behavior and lost acknowledgements without contacting Yahoo. Live sending requires review of an exact test recipient and message; development authorization alone does not authorize sending mail.

## Validation and remaining gates

The automated suite covers bounded sparse history, descending UID continuation, changed/expired/foreign cursors, exact date boundaries, envelope-only traversal, token expiry/content/account binding, confirmation assertions, concurrent commits, restart/replay state, private ledger contents, rate limits, SMTP Bcc handling, and ambiguous acceptance.

Repeat the designated synthetic unread-body smoke after read-path changes. macOS keyring and Muse Code host verification remain separate platform gates. Spark compatibility remains deferred until guarded send release gates, including Sent-folder verification and the remaining send safety checks, are satisfied.
