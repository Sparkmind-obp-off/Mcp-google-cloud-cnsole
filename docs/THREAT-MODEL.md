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
| Protocol downgrade / incompatibility | Native 2026 subset with required metadata/header matching and legacy SDK allowlist; shared registry | Actual client interoperability and broader conformance/security review unverified |
| Voice self-approval / accidental execution | Microphone only after explicit click; transcripts stay in textarea and cannot call tools; no executor exists | Browser/recognition provider may process audio; physical device/privacy verification required |
| Billing cross-project disclosure | Account derived from selected project and budgets filtered to exclusively selected project; explicit billing-scope opt-in | Google IAM/API and live budget grants unverified |

## Non-goals / forbidden writes

No project/folder/organization deletion, billing modification, IAM writes, privilege escalation, key generation, security-control disabling or destructive bulk operations. No Google Cloud writes of any kind are enabled in this release. No S3 writes or paid AI/voice inference occurred. The user-approved initial Neon schema migration was applied; no application data, roles or Google Cloud resources were mutated. Browser voice adapters were tested with simulated APIs, not a physical microphone.

## Acceptance evidence still required

Live Neon connection and the approved initial migration are verified, and the development Worker is deployed. Still required: restricted runtime role/secret binding; real Google OAuth and IAM denial paths; actual external MCP client login; independent human consent security review; controlled test-project mutation, revalidation and complete outcome audit; operational incident/recovery exercise. Until then the connector remains development-only.
