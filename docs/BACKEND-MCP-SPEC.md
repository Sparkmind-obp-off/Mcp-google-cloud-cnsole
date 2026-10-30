# Backend and MCP specification

## Backend boundary
A dedicated Cloudflare Worker is the only authoritative backend and MCP server. Pages Functions must not duplicate its business rules or expose an alternate MCP endpoint.

## Backend modules
- HTTP routing and request validation
- MCP transport compatibility and protocol negotiation
- MCP bearer/JWT validation
- user identity and project authorization
- Google OAuth state, PKCE, nonce, callback and disconnect
- encrypted Google token repository and refresh coordination
- Google API adapters with fixed hosts and strict schemas
- audit/security event writer
- readiness/configuration checks
- rate limiting and safe error mapping

## MCP surface (MVP)
Read-only tools only. The existing registry includes project/IAM, Compute Engine, Cloud Run/revisions, Storage, Cloud SQL, bounded Logging and project billing reads. Actual exposure is conditional on configuration, scopes, API enablement and IAM. Do not infer that every tool is live because code exists.

Core first acceptance tool:
- `gcp_list_projects`: return only projects explicitly granted to the authenticated app user and visible to the Google identity. Return project ID/name/state and minimal metadata.

Follow-on reads:
- `gcp_list_iam_policy` or equivalent bounded IAM read.
- Compute instances list.
- Cloud Run services/revisions list.
- Storage buckets list.
- Cloud SQL instances list.
- Bounded project logs query.
- Project-scoped billing/budget only when separately enabled and consented.

## Authorization on every call
1. Verify JWT signature against configured trusted JWKS.
2. Verify issuer, audience/resource, expiry, not-before and permitted algorithm.
3. Require expected scope (MVP: `mcp:read`).
4. Resolve registered, enabled subject to application user.
5. Resolve requested project from an explicit grant.
6. Verify Google connection belongs to the same user.
7. Verify required Google IAM/API capability through provider response; do not bypass denials.
8. Apply tool-specific limits and redact sensitive fields.
9. Record audit event with user, project, tool, outcome and correlation ID.

## OAuth boundaries
ChatGPT/client-to-Worker OAuth and Worker-to-Google OAuth are separate trust domains. Do not reuse Google access, refresh or ID tokens as MCP credentials. Do not invent OAuth endpoints; configure a standards-compatible external MCP authorization server and verify its metadata/flow with the actual client.

## Protocol compatibility
Existing branch supports a synchronous stateless native protocol subset and legacy SDK Streamable HTTP. ChatGPT's documented transport/auth requirements must be tested against the actual deployed Worker; local protocol tests do not certify compatibility. Do not claim SSE/streaming compatibility without a real test.

## Errors
- 401: missing/invalid MCP authentication; include correct protected-resource metadata when configured.
- 403: authenticated but unauthorized user/project/scope.
- 404: unknown tool/resource where appropriate.
- 409: state conflict or already-consumed one-time operation.
- 429: rate limit.
- 503: required runtime configuration/database/provider dependency unavailable.
Errors must not include token values, raw upstream bodies, DSNs, SQL or internal stack traces.

## Writes
MVP has no write tools. Approval primitives already present are not a human approval product or executor. Any future write phase requires a separate threat model, explicit user confirmation per exact payload, fresh state revalidation, least-privilege IAM, idempotency/unknown-outcome handling and append-only audit. Never enable broad cloud-platform write scope as a shortcut.
