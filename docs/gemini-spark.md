# Gemini Spark compatibility plan

Status: local synthetic HTTP contract verified; public Spark connection still pending. The Yahoo connector remains local `stdio` only, while Spark requires a reachable MCP server URL.

Google's current Spark custom-app flow accepts an MCP server URL added from the Gemini web app. A connected custom app can then be used from Spark on web and mobile. This makes Spark a Phase 3 remote-transport target, not a Phase 2 local-client target.

## Preconditions

- An eligible personal Google account with Gemini Spark access, English enabled, age/region eligibility satisfied, and Gemini Apps Activity enabled as required by Google.
- A temporary public HTTPS `/mcp` endpoint serving the synthetic provider.
- Host and Origin validation, strict request-size limits, timeouts, and no Yahoo credentials on the synthetic endpoint.
- Authentication appropriate for the test stage. An unauthenticated endpoint may be used only for non-sensitive synthetic fixtures, with an unguessable temporary deployment and immediate teardown; Yahoo-backed access requires OAuth/account binding.

## Test sequence

1. Run the remote MCP contract suite locally against the synthetic provider.
2. Deploy the same handler to a temporary HTTPS endpoint with synthetic fixtures only.
3. Add the URL under Gemini web app **Connected Apps > Custom apps for Spark**.
4. Confirm Spark discovers exactly `get_profile`, `list_mailboxes`, `search_messages`, and `fetch_message`, with read-only annotations and no write tools.
5. Invoke each tool using synthetic prompts and record the protocol version, request/response behavior, timeouts, and approval UI.
6. Confirm the custom app added on web is available in Spark mobile.
7. Exercise typed failures: invalid reference, missing message, oversized request, timeout, and endpoint unavailable.
8. Remove the custom app and tear down the temporary endpoint.
9. Repeat against the authenticated relay with a dedicated synthetic Yahoo account only after Phase 3 authorization and account binding pass their security gates.

## Acceptance criteria

- Spark connects without a Spark-specific fork of the mail tool contract.
- Tool schemas and annotations are displayed and invoked correctly.
- Synthetic results are bounded and no fixture is mistaken for live Yahoo data.
- The server rejects untrusted hosts/origins, oversized bodies, unauthenticated Yahoo-backed requests, and cross-account routing.
- Removing or revoking the connector prevents future calls.
- The final run records whether the same connection works from the Gemini mobile app.

## Current test result

On 2026-10-04, the live custom-app flow was exercised with an eligible signed-in Gemini Spark account. Spark accepted an HTTPS MCP URL, displayed its unreviewed-server warning, and presented a final consent screen explaining that Gemini may send prompts and other available Gemini context to the MCP server when using the app. The test reached the connection attempt, but the disposable Cloudflare tunnel hostname was not reachable from Spark, so tool discovery did not run and no custom app was retained.

The loopback-only Streamable HTTP adapter was independently verified with the official MCP client. It exposes exactly `get_profile`, `list_mailboxes`, `search_messages`, and `fetch_message`, advertises them as read-only, and uses the synthetic provider only; it cannot access Yahoo Mail or credentials. An earlier contract run also succeeded through a short-lived public HTTPS tunnel. No Yahoo data was shared during the Spark attempt.

The remaining live step is to deploy the synthetic adapter at a stable, publicly resolvable HTTPS endpoint, repeat the consent flow, and verify discovery and invocation. The observed consent text should be treated as a product-design requirement: documentation must tell users that Spark can send broader Gemini context to a custom MCP server, even when the connector's own tools are read-only.

## References

- [Connect and manage custom apps for Gemini Spark](https://support.google.com/gemini/answer/17209137)
- [Gemini Spark updates: custom MCP connected apps](https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/)
