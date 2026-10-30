# Threat model

## Assets and attackers

Assets: Google refresh/access tokens, Google identity, external MCP JWTs, project/IAM/resource metadata, approval identities/hashes, encryption key and audit records. Attackers include anonymous callers, compromised AI clients, cross-tenant authenticated users, malicious browser origins, replay attackers and compromised runtime DB credentials.

| Threat | Implemented boundary | Residual risk / release gate |
|---|---|---|
| Login CSRF / callback injection | One-time hashed state, browser cookie, PKCE, nonce and verified Google ID token | Live Google authorization must be tested; no browser login UI yet |
| Confused deputy / Google token as MCP auth | Independent configured issuer/audience/JWKS and `mcp:read`, registered-user lookup | External authorization server and client registration not configured |
| Cross-tenant record access | User predicates, composite FKs, AAD context | RLS and runtime DB privileges not provisioned/tested |
| Token/database theft | AES-GCM access+refresh tokens, no plaintext returns, safe errors | Single-key rotation is not automated; key and DB co-compromise remains critical |
| Approval spoofing/self-approval | No public approve/execute route or tool | Human confirmation and executor NOT IMPLEMENTED |
| Approval expiry/payload mutation/replay | Internal immutable binding, exact hash/state check, atomic conditional claim and consumption | No production mutation path or actual resource revalidation exists yet |
| Audit tampering | Append-only triggers; decisions/claims and audit in same statement | DB owner can bypass triggers; runtime must not be DB owner |
| SSRF / arbitrary API proxy | Fixed API host registry, schema-validated path segments, no redirects | Registry changes require review |
| Application secret leakage | Known-sensitive-field redaction and no raw logs | Resource names/labels/custom fields can contain arbitrary data; redaction is not a universal DLP system |
| Abuse / resource exhaustion | Input/output limits, timeouts, bounded pages, authenticated persistent rate counters | Add edge WAF/rate limits and retention before production; unauthenticated auth checks still cost resources |
| Protocol downgrade / incompatibility | Explicit negotiated SDK-era version allowlist | Native 2026 protocol and actual client compatibility not implemented/verified |

## Non-goals / forbidden writes

No project/folder/organization deletion, billing modification, IAM writes, privilege escalation, key generation, security-control disabling or destructive bulk operations. No Google Cloud writes of any kind are enabled in this release. No S3 writes, AI inference charges, voice generation or cloud migrations were performed during verification.

## Acceptance evidence still required

Live Neon read test, reviewed migration approval and deployment; real Google OAuth and IAM denial paths; actual external MCP client login; independent human consent security review; controlled test-project mutation, revalidation and complete outcome audit; operational incident/recovery exercise. Until then the connector remains development-only.
