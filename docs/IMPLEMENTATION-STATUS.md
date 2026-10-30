# Implementation status — 0.3.0 development, 2026-10-30

Labels: **PASS — Verified working.** **PARTIAL — Implemented but not fully verified.** **BLOCKED — Requires external configuration or access.** **NOT IMPLEMENTED — Not yet built.**

## Current evidence

| Area | Status | Actual evidence / limitation |
|---|---|---|
| Original repository audit | PASS — Verified working. | All 13 original tracked files inspected; existing Worker/plugin architecture preserved |
| Requested Git branch | PASS — Verified working. | 0.3.0 application pushed to MainFunc; main not overwritten |
| Live Neon connection | PASS — Verified working. | HTTP and WebSocket, neondb/public, PostgreSQL 18.6 |
| Approved initial migration | PASS — Verified working. | 001_initial.sql committed remotely at 2026-10-30T11:56:31.386Z, checksum matches, 12 public tables, 9 neon_auth tables preserved |
| Runtime DB identity/binding | BLOCKED — Requires external configuration or access. | Supplied admin has CREATEDB/CREATEROLE/BYPASSRLS; no role change was approved or made and admin DSN was not deployed |
| Automated suite / audit | PASS — Verified working. | 42 tests pass; zero npm audit vulnerabilities; source secret scan clean |
| Native MCP 2026 subset | PARTIAL — Implemented but not fully verified. | Discovery/ping/tools/list/call, per-request metadata, headers, resultType/errors, notifications tested locally; actual MCP-client interoperability missing |
| Legacy MCP transport | PARTIAL — Implemented but not fully verified. | Official SDK initialization-era tests pass; no actual authorized external client |
| Google OAuth/encrypted lifecycle | PARTIAL — Implemented but not fully verified. | Mock callback, identity, refresh/CAS and revoke tests; real Google client/consent not available |
| External MCP issuer/user registration | BLOCKED — Requires external configuration or access. | Issuer/JWKS and users not provisioned; no token issuer invented |
| Google read tools | PARTIAL — Implemented but not fully verified. | Fixed-host schema-validated registry and representative mock tests; no real Google projects queried |
| Budget read | PARTIAL — Implemented but not fully verified. | Opt-in cloud-billing scope, associated-account derivation and single-project filtering tested with mocks; default disabled, live IAM/API unavailable |
| Onboarding/dashboard | PASS — Verified working. | Deployed HTML/JS 200, browser loads with zero console messages; shows actual unconfigured booleans |
| End-user onboarding/login | PARTIAL — Implemented but not fully verified. | Registered-user token workbench/Google start UI exists; no login/registration/project-grant provider/UI configured |
| Browser voice | PARTIAL — Implemented but not fully verified. | Explicit-click dictation/speech adapters tested with mocks; UI loads; physical mic/remote recognition not tested |
| Approval primitives | PARTIAL — Implemented but not fully verified. | Exact identity/payload/state/expiry, SQL races/claim/replay/audit tests pass; no public consent or executor route |
| Human consent UI / GCP executor | NOT IMPLEMENTED — Not yet built. | Dashboard explains disabled gate but does not display a live approval list or fabricate approval IDs |
| BYOK development deployment | PASS — Verified working. | google-cloud-connector-development, version 1f17e7b3-c06f-448d-92ca-7e77dbdf15bd; live URLs checked |
| Production readiness/deployment | BLOCKED — Requires external configuration or access. | No production publish; /ready and /mcp correctly 503 in development until runtime prerequisites exist |

Development URL: https://google-cloud-connector-development.sparkmind-support.workers.dev

## Deployment boundaries

Public Worker has no DATABASE_URL, Google client secret, token-encryption key or external issuer configured. Only nonsecret development origin/redirect/audience and disabled budget flag are bound. No uploaded credentials were exposed, no runtime admin DSN was installed, no application users or permissions seeded, and no Google Cloud resource mutation occurred. Role provisioning remains a separate exact administrative change, not part of the approved schema migration.

Native protocol implementation supports synchronous read tools only and does not advertise optional subscriptions, MRTR sampling/elicitation or tasks. Compatibility beyond tested requests requires a real client and production security review; local schema/protocol tests are not certification.

## Remaining sequence

1. Provision/review a restricted runtime database role and safe secret binding; rotate previously shared secrets without pasting them into chat.
2. Configure Google client and independent MCP provider; register controlled users/project grants via approved administration.
3. Verify live Google consent/token lifecycle, actual MCP client discovery/invocation, IAM denials/API-disabled errors and each real read capability.
4. Add independently authenticated human confirmation, current-state reread, write-scope/IAM validation, idempotency/unknown-outcome handling and result audits; run only individually approved controlled GCP operations.
5. Review WAF/rate limits, DB permissions/retention, key/backup recovery and browser voice privacy; pass production acceptance before production publish.

## Historical baseline

Original e898118 scaffold had D1 placeholders, discarded OAuth tokens and disabled MCP. 0.2.0 added secure read-only foundations, 25 tests and isolated PostgreSQL validation. The first live read check found an empty public schema; the user later explicitly approved the exact initial migration, which is now applied. Earlier blocked-migration and unimplemented-native/voice/budget observations in historical records are superseded by the current matrix.
