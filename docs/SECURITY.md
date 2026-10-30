# Security

## Implemented and locally tested

- External MCP JWT signatures (RS256/ES256), pinned issuer/JWKS URL and audience, required `sub`/`iat`/`exp`, maximum token age one hour, `mcp:read` scope, explicit registered-user lookup. Disabled users are denied.
- OAuth state: random 256-bit state stored hashed, ten-minute expiry, atomic delete/return, user enabled check, browser-bound Secure/HttpOnly/SameSite=Lax host cookie.
- PKCE S256 and encrypted verifier; Google ID-token signature, issuer, audience, nonce, subject, verified email and optional authorized-party checks.
- AES-256-GCM random IVs with user/connection AAD; access and refresh tokens encrypted at rest; no credential returns or provider exception strings.
- Refresh CAS prevents stale overwrites and resurrection of disconnected connections.
- Parameterized PostgreSQL queries, user filters and composite tenant foreign keys. This is not RLS.
- Exact-origin CORS, bearer-only protected routes; OAuth start and disconnect require same-origin JSON POST. Tokens never travel as URL query parameters.
- JSON request cap 32 KiB, Google success response cap 1 MiB, bounded tool inputs, no arbitrary upstream URL, no shell execution. Redirects to Google API destinations are not followed.
- Per-registered-user persistent minute counters (60 requests/minute, 5 OAuth starts/minute, 10 valid callbacks/minute). Invalid callbacks do not allocate arbitrary rate-limit buckets.
- Known-sensitive-field redaction (tokens, passwords, env, VM metadata, raw log payloads and similar fields). Arbitrary application data is not guaranteed secret-free; review fields before broad production access.
- Internal approvals: canonical exact-payload/state hashing, tenant binding, expiry, conditional atomic claim, one-time consumption, immutable identities, append-only audit/security event triggers.

## Mandatory deployment controls still outstanding

- Real provider and tenant tests, external OAuth client compatibility, platform-level abuse/WAF limits before expensive JWT/database work.
- A separately authenticated human approval channel and audited executor with IAM/write-scope validation and current-state rereads.
- Production least-privilege database role and review; app tests do not demonstrate provider-side role configuration. Do not use the migration owner as the Worker runtime identity. Limit audit/security tables to INSERT/SELECT; do not grant runtime ALTER/TRIGGER privileges.
- Retention, cleanup, backup/recovery, incident response practice, key rotation and token re-encryption procedure verification.
- Native 2026 synchronous protocol subset is implemented and locally tested; actual external client interoperability, broader protocol conformance and security review remain outstanding.
- Dashboard uses same-origin external JS, strict CSP, no Google/API/database secrets embedded, in-memory-only MCP client token input and no local/session storage. Browser voice requires explicit clicks; transcripts never call tools or approve operations. Physical mic/provider behavior and recognition privacy remain unverified.
- Budget reads are disabled by default. Opt-in requests the Google-required cloud-billing scope, rechecks grants after refresh, derives billing account from the selected project's association and filters mixed/account-wide budgets. No billing mutation API is exposed.

## Secrets and rotation

Do not paste secrets in chat or commit `.env`, `.dev.vars`, database dumps or OAuth request URLs. Use provider dashboards and Worker secrets. Secrets shared previously should be rotated at the issuing service. S3/AI Gateway tokens have no role in Google OAuth or PostgreSQL authentication.

`TOKEN_ENCRYPTION_KEY` is base64url-encoded 32 random bytes. Generate it locally, protect it in a password manager/secret store and provision without logging. Do not overwrite an existing encryption key: old connections will become unreadable. The `v1` format currently supports one key only; a reviewed key-ID/keyring migration or explicit disconnect/reauthorization is required before rotation. Back up DB ciphertext and key separately.

Cloudflare invocation logs are disabled in tracked configuration; never add logs containing callback query strings, authorization headers, token responses or raw database exceptions. Client errors contain allowlisted codes only. Provider dashboard and edge request logs still need an operational redaction review.

## Reporting and acceptance

No production-ready claim is made. Passing isolated tests is not a penetration test or evidence of live Google OAuth/API connectivity. Live Neon connection and the approved initial migration have separate actual evidence; these do not prove production runtime permissions or application readiness. Send suspected vulnerabilities privately to the repository owner without including live credentials in public issues.
