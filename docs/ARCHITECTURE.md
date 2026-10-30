# Architecture — implemented development boundary

## Existing repository audit

Baseline commit: `e898118`. All 13 tracked files were inspected before edits. The repository was clean and synchronized with origin/main. The Worker implemented liveness and an incomplete OAuth exchange using D1 placeholders, consumed state with a non-atomic SELECT/DELETE, discarded tokens, lacked PKCE/browser/identity binding, and returned 501 at `/mcp`. The D1 schema did not implement the requested Neon design. There were no package manifests, runtime tests, Google API tools or approval executor. Plugin metadata and skill instructions were retained; unsafe historical IAM/API-enable proposals were removed from the active release design.

## Components now present

- `worker/src/index.js`: request routing, strict origin/host checks, security headers, configuration and readiness, bearer auth, bounded JSON parser.
- `security.js`: safe error codes, canonical JSON/hash, AES-GCM, external MCP JWT validation.
- `database.js`: Neon HTTP prepared queries, user/connection/project authorization, state consumption, rate counters and audit persistence.
- `oauth.js`: Google auth code + PKCE, server state plus browser cookie, signed Google ID-token verification, encrypted access/refresh tokens, refresh CAS, explicit disconnect.
- `tools.js`: allowlisted Google API read requests with Zod schemas, response bounds and known-sensitive-field redaction.
- `mcp.js`: official MCP SDK, stateless Web Standard Streamable HTTP and JSON replies; server instance per request, no in-memory session store.
- `approvals.js`: internal-only persistence and validation primitives; NO Google write transport.
- `database/migrations`: PostgreSQL schema. D1 configuration removed; old schema path retained only as a retirement notice.

## Independent trust boundaries

1. External MCP OAuth server issues signed JWT access tokens scoped `mcp:read`, with configured issuer/JWKS and audience. Worker verifies the signature, issuer, audience, expiry, iat and registered subject. This repository is not an authorization server and does not issue MCP access tokens.
2. Registered user initiates Google OAuth from the same browser origin. Callback uses a short-lived browser binding and consumes one-time server state. Google ID token binds the consented Google subject to that registered user.
3. Project grants are explicitly maintained by an administrator in PostgreSQL. A connector grant never grants Google IAM. All actual GCP API requests enforce Google's delegated scopes, IAM and API enablement independently.
4. Independent human write approval has NOT been built. No approval or execution MCP tools are exposed. This avoids AI self-approval while that trust boundary is incomplete.

## State and storage

The Neon HTTP driver uses parameterized queries. All app record queries include the authenticated user ID; composite foreign keys reject cross-tenant relationships. This is application-level tenant isolation, NOT a claim of deployed PostgreSQL RLS. Runtime DB privileges must be restricted separately. Migrations are operator-only and do not execute on request/startup.

OAuth refresh uses conditional ciphertext replacement to avoid overwriting a concurrently changed/revoked connection. Approval decision, approval creation and audit write use one SQL statement. Claiming an approved operation, consuming its approval and auditing the claim also use one statement. These claims do not execute Google operations.

## Current limitations

No live provider verification, no built-in login/onboarding UI, no native 2026 MCP metadata protocol, no actual MCP client connection, no human consent UI or write executor, no production release. No background jobs or cron dependency. Retention/cleanup is an operator maintenance task until implemented safely.
