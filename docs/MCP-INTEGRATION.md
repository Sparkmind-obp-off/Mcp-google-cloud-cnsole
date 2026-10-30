# MCP integration

## Implemented transport

Official `@modelcontextprotocol/sdk` 1.32.2 with WebStandardStreamableHTTPServerTransport, JSON responses, stateless operation and a new server per request. No durable sessions or request state in Worker memory. `/mcp` accepts POST only; GET/SSE subscriptions and session DELETE are not supported in this stateless deployment. Clients must send `Accept: application/json, text/event-stream` and JSON content type.

Supported negotiated versions: `2025-11-25`, `2025-06-18`, `2025-03-26`. Initialize, tools/list and tools/call are tested locally. SDK supports older initialization-era revisions but this connector intentionally restricts the accepted list. `MCP-Protocol-Version` must match a listed version when supplied.

**Latest native protocol gap:** official documentation currently points to the 2026-07-28 per-request metadata protocol. The installed published SDK implements initialization-era semantics; this connector explicitly rejects unsupported versions instead of claiming current-native compatibility. An actual client may support legacy negotiation, but that must be verified; no such connection was verified here.

## Independent OAuth

This Worker is an OAuth protected resource, NOT an OAuth authorization server. `/.well-known/oauth-protected-resource` advertises configured resource, external authorization server, `mcp:read` and bearer-header support. A 401 includes resource metadata in WWW-Authenticate.

Configure a real external authorization server with authorization code + PKCE, client registration or preconfigured clients, consent/login, JWT access tokens, refresh/revocation and audience validation. The Worker validates RS256/ES256 JWTs via the pinned JWKS, configured issuer/audience, required subject/expiry/iat, scope and registered-user lookup. External token lifetime must not exceed the one-hour acceptance policy. Google refresh/access/ID tokens are never accepted as MCP credentials.

No local `/authorize`, `/token`, dynamic registration or generic placeholder URLs are offered. ChatGPT/other client compatibility depends on this external provider and remains BLOCKED until configured and tested.

## Client configuration template — not a live connection

For a Streamable HTTP client that supports environment-backed headers, configure its remote server URL as `${APP_ORIGIN}/mcp` and send `Authorization: Bearer ${MCP_ACCESS_TOKEN}`. Obtain the token from the external authorization server through the client's supported OAuth flow; do not hardcode it in a tracked JSON config or URL. There is no verified production origin to insert yet. Client config formats differ; verify the target client's actual format before use.

Example protocol sequence (development test values only):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test-client","version":"1"}}}
```

Then `notifications/initialized`, `tools/list` and a scoped `tools/call`. Each request still needs its own bearer token; a session ID is not authorization. An external client cannot submit `gcp_approve_operation` or `gcp_execute_operation`: neither exists in this release.

## Acceptance checklist

Verify live OAuth discovery/login/token issuance, registered-user mapping, Google connection, selected project grant, initialize/discovery/invocation, expired/wrong-audience token denial and cross-user/project denial. Preserve redacted evidence only. Local mock transport tests do not satisfy actual ChatGPT connection acceptance.

References:
- https://modelcontextprotocol.io/specification/latest/basic/transports
- https://github.com/modelcontextprotocol/typescript-sdk
