# Testing and evidence

## Automated commands

```sh
npm ci
npm test
npm run build
npm audit
npm run db:check
npm run release:check
```

The last two require special interpretation: database check needs a real securely provisioned DSN and is BLOCKED without it; release check deliberately exits 2 because known implementation and live-verification gaps remain.

## Local automated coverage

`tests/security.test.js`: RFC PKCE vector, AES-GCM roundtrip/wrong key/AAD/tampering, canonical hashing, configuration rejection, strict input/path/page validation, approval identity/payload/state/expiry/replay, signed JWT signature/issuer/audience/expiration/scope/user checks, bounded JSON parser, safe Google error mapping and known-secret redaction.

`tests/integration.test.js`: executes the actual PostgreSQL schema in PGlite, checks required tables/indexes/tenant FKs and rollback; exercises real SQL state consumption/expiry, encrypted callback persistence with mock Google, wrong nonce, refresh token rotation/CAS, project-before-API validation, approval decision/claim/replay/race and immutable audit records, official SDK initialize/discovery/call, malformed args, unsupported versions, bearer/origin checks, same-origin OAuth start and explicit disconnect/revocation with mocked provider.

PGlite is an isolated embedded PostgreSQL engine, not a Neon network service. Mock Google responses and dependency-injected identity verification are labeled in the tests; live Google identity signatures are not being claimed. JWT cryptography itself is tested using locally generated keys. Concurrent SQL tests validate a single PostgreSQL engine; distributed Neon contention/load behavior still needs live verification.

## Evidence from this implementation session

- 25 automated tests pass; zero failures (including nested test count).
- Cloudflare Worker bundle dry-run passes. It is NOT a deployment.
- `npm audit`: zero vulnerabilities after upgrading the originally vulnerable Zod 3 dependency to 4.6.7.
- Cloudflare whoami succeeds. Existing target Worker lookup returned code 10007 (does not exist).
- Supplied Neon S3 credentials were used for a signed GET ListBuckets only: HTTP 403 `AccessDenied`; no bucket/object listing was returned. This does not prove credentials invalid or storage operational; bucket-level access may be different. No write was attempted.
- AI Gateway live check is BLOCKED: branch-specific NEON_AI_GATEWAY_BASE_URL was not supplied. No guessed endpoint received the token, no inference/generation was run and no voice feature exists.
- Follow-up Neon live read-only connectivity: PASS through both HTTP and WebSocket, database neondb, schema public, PostgreSQL 18.6. Public has zero tables, no connector migration tracker exists, and the supplied administrative role is too broad for runtime (CREATEDB/CREATEROLE/BYPASSRLS). No credentials were logged/persisted and no DDL/application DML was run. Production migration, restricted runtime role and deployed secret binding remain BLOCKED pending approval/configuration. Google live consent/API tests remain BLOCKED: client configuration and authorized account absent.

Local preview verification is recorded in VALIDATION.md after the runtime check. A sandbox URL is not a production deployment.

## Required live tests not run

Approved Neon migration, restricted runtime connector-table permissions and distributed behavior; Google OAuth redirect/ID token/callback/token expiry-refresh/revoke; each supported API and permission failure against an authorized project; actual MCP client authorization/initialization/tool discovery/read; independently approved write, stale-state/replay/expiry/unknown-outcome auditing; endpoint rate/abuse tests and operational key/backup recovery. Never run destructive tests against production. Do not replace these with fabricated provider responses in acceptance reports.
