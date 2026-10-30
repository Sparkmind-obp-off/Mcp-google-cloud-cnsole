# Access control and OAuth integration contract

Status: implementation contract. Values and endpoints must be configured and verified per environment; this document does not assert live OAuth readiness.

## Two independent authorization boundaries

### A. ChatGPT/client → MCP backend
Purpose: authorize the MCP client to call this connector.
- Use an OAuth authorization server compatible with the exact ChatGPT custom MCP flow.
- Publish standards-compliant authorization-server and protected-resource metadata.
- Advertise and issue refresh tokens / offline access where supported and required to keep the connection alive.
- Validate issuer, audience/resource, signature, expiry, not-before, scope and subject on every request.
- Register the user subject in the application before granting project access.
- Do not accept Google access, refresh or ID tokens as MCP bearer credentials.

### B. MCP backend → Google Cloud
Purpose: authorize the connector to call Google APIs as the consenting Google identity.
- Use a Google OAuth Web application with the exact Worker callback URI.
- Use least-privilege read-only scopes for MVP.
- Validate OAuth state, PKCE, nonce, redirect URI and returned identity.
- Store provider tokens encrypted in Neon; never send them to ChatGPT or the browser.
- Refresh tokens only on the backend; coordinate refresh rotation.
- Revoke/disconnect safely and prevent future calls after revocation.

## Authorization decision for each tool call
A tool call is permitted only if all checks pass:
1. MCP token is valid and intended for this resource.
2. Subject maps to an enabled application user.
3. Tool is enabled in this environment.
4. Requested project is explicitly granted to that user.
5. Google connection belongs to that same user and is active.
6. Google IAM and API-level permissions permit the requested read.
7. Request is within tool-specific bounds and rate limits.

Any missing/ambiguous condition denies the request. Never fall back to a broader service account or a different user's Google connection.

## Project grant model
- Default deny: no project is accessible until explicitly granted.
- Grant is user + project + permitted capability + status + timestamps.
- MVP capability is read-only.
- Grant revocation takes effect on the next tool call.
- Do not infer project membership from a project ID supplied in a prompt.
- Never list all projects visible to a Google identity unless the app grant policy explicitly permits those results; filter output to the app's allow-list.

## ChatGPT connection requirements
- HTTPS endpoint reachable by ChatGPT.
- Transport and protocol behavior verified against the current ChatGPT client, not merely unit tested.
- OAuth discovery metadata and redirect flow verified with the ChatGPT custom MCP UI.
- Ensure refresh/offline access is advertised and refresh tokens are actually issued where needed; OpenAI documents that missing refresh-token support may break long-lived connectivity.
- Tool discovery exposes only the MVP read tools.
- A changed tool schema may require a workspace administrator to refresh/review the tool snapshot.

## Current known blockers
- The Free account is not listed as eligible for custom MCP connections in current OpenAI documentation. Verify actual account/workspace UI; do not claim entitlement.
- External MCP authorization issuer/JWKS/audience are not configured in the recorded baseline.
- Google OAuth client and consent configuration are not live in the recorded baseline.
- Restricted Neon runtime role/DSN and project grants are not provisioned in the recorded baseline.
- /ready and /mcp remain expected to fail closed until required configuration is installed.
