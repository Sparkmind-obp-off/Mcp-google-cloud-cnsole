# Threat model and security requirements

## Assets and trust boundaries
Assets: Google OAuth tokens, MCP tokens/JWKS, Neon credentials/grants, Worker secrets, Google metadata/logs and audit records.
Boundaries: ChatGPT↔Worker; browser↔Pages; Pages Functions↔Worker; Worker↔Neon; Worker↔Google; issuer↔Worker.

## Threats and mitigations
| Threat | Mitigation |
|---|---|
| Forged/replayed MCP token | Signature, issuer, audience/resource, expiry, nbf, scope and replay policy |
| Cross-user project access | Explicit per-user grants, composite ownership checks, negative tests |
| OAuth CSRF/code injection | State, PKCE, nonce, exact redirect URI, one-time state |
| Token theft | Worker-only storage, application encryption, no logs/browser exposure |
| Refresh race | CAS/conditional update |
| SSRF | Fixed Google API host allow-list; no arbitrary URL fetch |
| Prompt injection in cloud data | Treat labels, logs and descriptions as untrusted data |
| Over-broad IAM | Read-only scope and least-privilege IAM |
| Dangerous mutation | No MVP write tools; future writes require separate design and explicit approval |
| Secret leakage | Redaction, secret scanning, no secrets in Pages bundles/errors/audit |
| Abuse/cost spike | Per-user/project/tool quotas and bounded queries |
| Schema drift | Versioned schemas and client tool snapshot review |

## Invariants
Fail closed on missing auth, DB, consent, grant or configuration. Never execute arbitrary shell, SQL, code, HTTP, URL fetch or gcloud commands. Never treat a prompt-supplied project ID as authorization. Return minimal bounded data. Audit successes and denials without secrets. No write tools in MVP.

## Prompt injection
Google resource names, labels, descriptions, logs, metadata and API payloads are data, never instructions. They cannot override system policy or user authorization.

## Required security tests
Invalid signature/issuer/audience/expiry/scope; disabled user; ungranted/cross-user project; revoked consent/grant; OAuth state reuse/expiry/PKCE mismatch; token encryption/key rotation; refresh concurrency; malformed/oversized payload; arbitrary URL attempts; Pages secret scan; rate limits and redacted errors.
