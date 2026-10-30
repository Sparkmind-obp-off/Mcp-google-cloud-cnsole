# Access control and OAuth integration contract

Two independent authorization boundaries are mandatory.

## ChatGPT/client → MCP backend
- Use an OAuth authorization server compatible with the actual ChatGPT custom MCP flow.
- Publish protected-resource and authorization-server discovery metadata.
- Support refresh/offline access where required; verify refresh tokens are issued, not merely advertised.
- Validate JWT signature, issuer, audience/resource, expiry, nbf, scope and registered subject on every call.
- Never accept Google access/refresh/ID tokens as MCP bearer credentials.

## MCP backend → Google Cloud
- Use a Google OAuth Web client with the exact Worker callback URI.
- MVP scopes are read-only and least-privilege.
- Validate state, PKCE, nonce, redirect URI and Google identity.
- Encrypt tokens before Neon persistence; never return them to browser or ChatGPT.
- Refresh only in Worker; use concurrency-safe token rotation.
- Disconnect/revoke and block subsequent reads.

## Per-call authorization
A request is allowed only when MCP token, registered user, enabled tool, explicit user/project grant, same-user active Google connection, Google IAM permission, schema bounds and rate limits all pass. Missing or ambiguous checks deny access.

## Project grants
Default deny. A grant is user + project + capability + status. MVP capability is read-only. Revocation applies to the next call. A project ID supplied in a prompt is not proof of authorization. Filter provider results to the user's explicit allow-list.

## ChatGPT requirements
HTTPS endpoint; compatible transport; OAuth discovery and authorization tested with the real ChatGPT UI; refresh token behavior verified; only read tools exposed. Tool schema changes may require workspace-admin review/refresh.

## Recorded blockers
The Free plan is not listed as eligible in current OpenAI custom MCP documentation. External MCP issuer/JWKS/audience, Google OAuth client, restricted Neon runtime role/DSN and project grants were not configured in the recorded baseline. /ready and /mcp are expected to fail closed until prerequisites are installed.
