# Security policy

## Supported versions

This project is pre-release software. Security fixes are applied to the latest commit on `main`; no released version is currently supported.

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credential, account identifier, mailbox metadata, or message content.

Use GitHub's private vulnerability reporting for this repository. Include a concise description, affected commit, reproduction steps using synthetic data, impact, and any proposed mitigation. Do not include a real Yahoo app password or real email content even in a private report.

If a credential may have been exposed, revoke or rotate it at the provider before investigating or attempting to rewrite Git history.

## Security boundaries

- The connector accepts only Yahoo-generated app passwords, never the normal Yahoo account password.
- Local credentials use Windows Credential Manager, macOS Keychain, or Linux Secret Service.
- Linux fails closed when Secret Service is unavailable; it does not use the non-persistent kernel-keyring fallback.
- Managed-environment credentials must come from a reviewed hosting platform's secret store and require explicit opt-in.
- No credential may be passed as a command-line argument, committed to the repository, or stored in a `.env` file.
- Email content is untrusted input and must not be treated as instructions.
