# Contributing

This project is an experimental, read-only Yahoo Mail connector. Keep changes read-only unless a separate design review explicitly expands the capability boundary.

## Development

Requirements: Node.js 22 or newer and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm run check
```

Automated tests must use synthetic messages and credentials. Do not add real account identifiers, folder names, message metadata, message bodies, app passwords, API keys, terminal captures, `.env` files, or credential-store exports to issues, fixtures, snapshots, logs, or commits.

Live probes are opt-in and must use a dedicated test account containing synthetic mail. OS credential-store probes must delete their generated canary before exiting.

By submitting a contribution, you agree that it is licensed under the Apache License 2.0.
