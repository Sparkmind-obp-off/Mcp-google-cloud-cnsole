# Test plan and acceptance criteria

## Layers
Unit: JWT claims, OAuth state/PKCE/nonce, project grants, schemas/redaction, pagination/bounds, refresh CAS, safe errors.
Integration: Neon restricted role, encrypted token persistence, Worker→Google with dedicated identity, Pages→Worker CORS/CSRF, rate limits and audit persistence.
Client: ChatGPT MCP discovery, OAuth/refresh, tool schemas, invocation/errors and tool refresh. MCP Inspector tests do not replace a real ChatGPT test.

## MVP end-to-end scenario
Preconditions: eligible ChatGPT account/workspace; configured MCP issuer; Google OAuth client/callback; restricted DB runtime role; enabled user; one non-production project grant; Google identity with read-only IAM.

1. Add HTTPS Worker MCP endpoint in ChatGPT Plugins.
2. Complete MCP authorization.
3. Complete Google consent.
4. Verify only read tools are discovered.
5. Call gcp_list_projects; verify results are restricted to explicit grants.
6. Call one service list tool for the granted project.
7. Verify result is a live Google API response, not a fixture.
8. Verify audit event includes user/project/tool/outcome/time.
9. Attempt ungranted project; expect 403.
10. Revoke grant or consent; next read must fail.
11. Confirm no write tools are exposed.

## Pass criteria
Critical security tests pass; no cross-user/ungranted data; no secrets in logs/browser/MCP/repo; real ChatGPT connection and live Google API read verified; audit event recorded; revocation effective; /ready 200; no write tool.

## Fail criteria
Mock presented as live; scan works but invocation fails; no refresh path; prompt-supplied project bypasses grant; runtime uses admin DSN; readiness lies; any write tool appears.

## Evidence
Record commit/deployment IDs, environment/time, redacted tool/result status, provider response metadata, audit reference, negative authorization test and test output. Never retain bearer tokens, OAuth codes, refresh tokens or secrets.
