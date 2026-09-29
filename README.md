# Yahoo Mail AI Connector

An experimental, local-first Yahoo Mail connector for MCP-compatible AI clients.

The repository is currently in the Phase 2A spike stage. It contains a provider-neutral contract, a synthetic mail provider, a local MCP server, and opt-in probes for Yahoo IMAP and the operating-system credential store. It does not yet provide production Yahoo access or write operations.

See [the Phase 1 architecture](docs/phase-1-plan.md) and [the spike runbook](docs/spikes/README.md).

## Quick verification

```powershell
npm install
npm run check
```

The checked-in Muse Code example starts the compiled server, so run `npm run build` before using it.

## Connect Yahoo locally

Use a Yahoo-generated app password, never the normal account password:

```powershell
npm run connector:setup
npm run connector:doctor
npm run mcp:yahoo
```

`connector:setup` verifies the login before saving it to the operating-system credential store. `connector:remove` deletes the saved record. The MCP server retrieves the credential only when opening a Yahoo connection and exposes read-only operations.

## Safety status

- The default server uses synthetic messages only.
- The Yahoo probe is read-only and must be invoked explicitly.
- The keyring probe uses a generated canary and removes it after verification.
- Do not pass a Yahoo app password on the command line or put it in an environment file.
