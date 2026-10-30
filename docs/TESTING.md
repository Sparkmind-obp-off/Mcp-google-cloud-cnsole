# Testing and evidence — 0.3.0

## Commands

```sh
npm ci
npm test
npm audit
npm run build:development
npm run build
npm run db:check
npm run release:check
```

Database check needs a securely supplied DSN. The initial approved migration is already applied; the deployed development Worker deliberately has no administrative DSN installed. Release check still exits 2: production acceptance is incomplete. Stop local PM2 preview before embedded PostgreSQL tests on the 1 GiB sandbox to avoid memory pressure.

## Automated coverage: 42 pass, zero fail

- `security.test.js`: RFC PKCE vector, AES-GCM/AAD/tampering, canonical hash, config/input/path/page limits, exact approval identity/payload/state/expiry/replay, locally signed JWT issuer/audience/expiry/scope/registered-user checks, bounded JSON, safe Google errors and known-sensitive-field redaction.
- `integration.test.js`: actual isolated PGlite PostgreSQL migration, schema/index/FKs/rollback/tenant boundaries, atomic OAuth state expiry/consumption, mock Google encrypted callback/wrong nonce/refresh rotation/CAS/revoke, authorization-before-API, approval SQL races/replay/stale hash/immutability/audits, legacy SDK initialize/list/call and auth/origin/start checks.
- `modern-and-ui.test.js`: native 2026 discover/list/call without initialize, required per-request params._meta, exact mirror headers, Base64 sentinel validation, unsupported versions, invalid IDs/Accept/JSON/envelopes, unknown method/tool handling, route auth/origin, strict advertised schemas, secret-free dashboard status/CSP, voice explicit-click/no-autosend simulation, budget opt-in/scope/associated-account/single-project filtering, default-vs-opt-in consent scopes.

Mock Google responses are explicitly labeled. Locally signed JWT tests do not prove live Google identity verification or external MCP client registration. PGlite validates PostgreSQL behavior but is not the Neon network. Voice tests simulate SpeechRecognition/speechSynthesis APIs and do not use a physical microphone or actual recognition provider. Optional MCP subscriptions/MRTR/tasks are not implemented or advertised; tested subset is not a full client-conformance certification.

## Live Neon verification and approved migration

Uploaded PostgreSQL DSN was read in memory, not printed or committed. Both HTTP and WebSocket read-only tests connected to neondb/public on PostgreSQL 18.6. After specific user approval, the original runner applied only 001_initial.sql at 2026-10-30T11:56:31.386Z. Remote checksum matches; 12 public tables and all 9 pre-existing neon_auth tables remain. No application users/grants/data seeded and no roles changed. The supplied admin role has CREATEDB/CREATEROLE/BYPASSRLS and is not suitable for public Worker runtime. Distributed contention, restricted runtime privileges and recovery are not verified.

## Actual BYOK development deployment

URL: https://google-cloud-connector-development.sparkmind-support.workers.dev

Worker version: 1f17e7b3-c06f-448d-92ca-7e77dbdf15bd; deployed application commit d24add4245b31bf26db2b5f338501c84207aa988 on MainFunc. Build approximately 323 KiB gzip, reported startup 44 ms. This is development, not a production-ready connector.

Verified: root/script/health/status 200, ready 503 CONFIGURATION_REQUIRED, unconfigured MCP 503, untrusted-origin MCP 403, metadata 503 AUTH_NOT_CONFIGURED and execution path 404. Live browser loaded title Google Cloud Console Connector with zero console messages. No runtime DB/admin/Google secrets were deployed.

An earlier sandbox browser attempt timed out while the old UI fetched expected readiness 503; the UI now skips readiness probes when configuration is absent. Final Cloudflare browser load passed. Earlier low-memory PGlite SIGKILL was resolved by stopping preview before tests; the complete suite then passed. Neither issue was papered over as a passing run.

## Other credentials

Earlier signed read-only S3 ListBuckets returned 403 AccessDenied; no bucket data/write. AI Gateway still lacks branch-specific base URL; token not sent to guessed hosts. Browser voice needs neither these tokens nor paid audio generation. No GCP mutation or AI inference was executed.

## Outstanding live acceptance

Restricted DB role/secret binding; actual Google consent/refresh/revoke and real API reads/IAM/API-disabled cases; actual external MCP auth/client connection; independently authenticated human consent and audited state-revalidated executor; individually approved controlled write; WAF/rate/retention, token-key/backup recovery; physical voice device/provider privacy review. No destructive production tests are authorized by a generic instruction to finish.
