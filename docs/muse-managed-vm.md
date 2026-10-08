# Muse managed-VM deployment

This mode is for a Muse runtime that checks out the repository, builds it, and injects secrets through its managed credential store. It is distinct from Muse Code's local `stdio` configuration.

## Security boundary

Use a dedicated Yahoo-generated app password named for this Muse deployment. Do not reuse the app password stored on a developer workstation. Revoking that app password must disable the VM without disrupting local connector installations.

The connector never accepts Yahoo credentials as command-line arguments and must not use a committed `.env` file. In managed-VM mode, the hosting platform injects:

| Name | Secret | Value |
|---|---:|---|
| `YAHOO_CREDENTIAL_SOURCE` | No | `managed-environment` |
| `YAHOO_EMAIL` | Yes | The dedicated Yahoo account address |
| `YAHOO_APP_PASSWORD` | Yes | A dedicated Yahoo app password for Muse |

If the credential-source marker is absent, the connector fails closed rather than reading the other variables. Setup and removal remain operations of the Muse credential UI; the connector cannot modify managed secrets.

## Build and start

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/apps/local-connector/src/stdio.js --provider=yahoo
```

If the runtime has Node.js but neither `pnpm` nor Corepack, install the exact pnpm version declared by `packageManager` in the root [`package.json`](../package.json). For the current release:

```sh
npm install --global pnpm@11.19.0
```

Keep this command synchronized with `packageManager`; do not silently use an arbitrary newer package-manager version.

The runtime needs Node.js 22 or newer, outbound TLS access to `imap.mail.yahoo.com:993`, and an MCP host that launches the command over `stdio`.

## Validation order

1. Deploy first with `--provider=fake`; confirm all five read-only tools appear and run the synthetic receipt prompt.
2. Add the three managed configuration values above and switch to `--provider=yahoo`.
3. Call `list_mailboxes`. `get_profile` reads local configuration and does not connect to Yahoo, so it can verify tool wiring but cannot prove credentials, network access, or Yahoo availability. `list_mailboxes` is the first end-to-end Yahoo check.
4. Run a bounded metadata search.
5. Fetch a body only from a designated synthetic test message.

## Troubleshooting

### `list_mailboxes` reports that Yahoo Mail is unavailable

Work through these checks without enabling raw protocol logs:

1. Confirm the managed secret store contains a current, dedicated Yahoo app password and all three variables listed above. A successful `get_profile` does not validate the app password.
2. Confirm that the runtime permits outbound TLS to Yahoo IMAP:

   ```sh
   timeout 10 openssl s_client -connect imap.mail.yahoo.com:993 -brief
   ```

   A healthy path completes a TLS handshake and shows certificate/protocol information. Plaintext policy text or an immediate policy rejection indicates that the hosting platform or a network control is intercepting or blocking direct IMAP before the request reaches Yahoo.
3. Review Muse network permissions. Muse's sandbox defaults to controlled network access and can require approval for a new host, port, or protocol. Use `/permissions` in current Muse Code releases. During managed-runtime validation, the web UI exposed the relevant control under **Settings → Permissions → Direct network protocols → mailbox access** (`email_mailbox`); set it to an approval-based mode rather than unrestricted access. UI wording and availability may change, so prefer the current Muse permissions documentation when it differs.
4. Retry `list_mailboxes`. Do not diagnose connectivity from `get_profile` alone.

If the managed platform cannot permit direct IMAP, this deployment mode is incompatible with that runtime. Do not work around the restriction by proxying the Yahoo app password through an unreviewed service.

Do not enable raw transport or IMAP protocol logging. Do not include secret values, account identity, mailbox names, subjects, addresses, or bodies in build or runtime logs.
