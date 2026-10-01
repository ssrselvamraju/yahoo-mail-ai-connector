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

The runtime needs Node.js 22 or newer, outbound TLS access to `imap.mail.yahoo.com:993`, and an MCP host that launches the command over `stdio`.

## Validation order

1. Deploy first with `--provider=fake`; confirm all four tools appear and run the synthetic receipt prompt.
2. Add the three managed configuration values above and switch to `--provider=yahoo`.
3. Call `get_profile` and `list_mailboxes`.
4. Run a bounded metadata search.
5. Fetch a body only from a designated synthetic test message.

Do not enable raw transport or IMAP protocol logging. Do not include secret values, account identity, mailbox names, subjects, addresses, or bodies in build or runtime logs.
