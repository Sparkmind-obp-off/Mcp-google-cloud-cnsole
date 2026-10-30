# Google Cloud Console Connector

Cloudflare Pages frontend + Pages Functions UI layer, dedicated Cloudflare Worker backend/MCP server, and Neon PostgreSQL. The backend uses independent MCP authentication, Google OAuth and a fail-closed Google write boundary.

**0.3.0 development deployment is live. This is NOT a production-ready Google connection.** Google OAuth/MCP issuer configuration and a restricted runtime database role are not provisioned. No Google Cloud write executor is enabled.

## Target deployment architecture

- **Cloudflare Pages** serves the frontend and static assets.
- **Pages Functions** handle frontend routing and safe UI presentation adapters only; they do not host a second MCP server or duplicate Google API business logic.
- **Dedicated Cloudflare Worker** remains the backend and authoritative MCP endpoint, Google OAuth handler, authorization layer and Google API adapter.
- **Neon PostgreSQL** remains the application system of record.

The current 0.3.0 development deployment still serves its existing dashboard from the Worker. Pages extraction is a documented next milestone, not a completed deployment. See [system architecture](docs/SYSTEM-ARCHITECTURE.md), [frontend/UI](docs/FRONTEND-AND-UX.md), [backend/MCP](docs/BACKEND-MCP-SPEC.md), [database](docs/DATABASE-DESIGN.md), [product/North Star](docs/PRODUCT-AND-NORTH-STAR.md), [MVP roadmap](docs/MVP-AND-ROADMAP.md) and [technical blueprint](docs/TECHNICAL-MVP-BLUEPRINT.md).

## Complete documentation set

- [Product and North Star](docs/PRODUCT-AND-NORTH-STAR.md)
- [System architecture](docs/SYSTEM-ARCHITECTURE.md)
- [Frontend and UI/UX](docs/FRONTEND-AND-UX.md)
- [Backend and MCP specification](docs/BACKEND-MCP-SPEC.md)
- [Database design](docs/DATABASE-DESIGN.md)
- [Access control and OAuth](docs/ACCESS-CONTROL-AND-OAUTH.md)
- [Threat model and security](docs/THREAT-MODEL.md)
- [MVP and roadmap](docs/MVP-AND-ROADMAP.md)
- [Technical MVP blueprint](docs/TECHNICAL-MVP-BLUEPRINT.md)
- [Test plan and acceptance](docs/TEST-PLAN-AND-ACCEPTANCE.md)
- [Operations and recovery](docs/OPERATIONS-AND-RECOVERY.md)
- [Master System Prompt — Google Cloud Operator](docs/MASTER-SYSTEM-PROMPT.md)
- [ChatGPT custom MCP setup](docs/CHATGPT-DIRECT-MCP-SETUP.md)

## URLs and GitHub

- **Development Worker**: https://google-cloud-connector-development.sparkmind-support.workers.dev
- **Health**: https://google-cloud-connector-development.sparkmind-support.workers.dev/health
- **Readiness**: https://google-cloud-connector-development.sparkmind-support.workers.dev/ready — expected 503 until runtime prerequisites exist.
- **Repository / requested branch**: https://github.com/Sparkmind-obp-off/Mcp-google-cloud-cnsole/tree/MainFunc
- **Worker version**: `1f17e7b3-c06f-448d-92ca-7e77dbdf15bd` (application commit `d24add4245b31bf26db2b5f338501c84207aa988`).
- Production Worker was not deployed. No custom domain was configured. `main` remains unchanged by the 0.3.0 branch work.

## Verified results

- Approved Neon migration `001_initial.sql` applied at `2026-10-30T11:56:31.386Z`; remote checksum matches the committed file. **12 public tables** including tracking; existing **9 neon_auth tables preserved**. No users/project grants/application records seeded and no roles changed.
- Live Neon HTTP and WebSocket connectivity verified. Database `neondb`, schema `public`, PostgreSQL 18.6. The provided administrative DSN was used in process memory only; it was not committed or installed on the public Worker.
- **42 automated tests pass**, zero failures. Tests include real isolated PostgreSQL constraints, legacy SDK MCP, native MCP 2026 metadata/header/errors, budget scope/project isolation and browser voice adapters. Google API tests still use mocks.
- Development Worker and JS asset return 200; public configuration status contains booleans only. `/ready` and unconfigured `/mcp` intentionally return 503; untrusted-origin MCP returns 403; write execution path returns 404.
- Browser verification of the deployed dashboard loads with the correct title and **zero console messages**. No physical microphone/recognition-provider or actual Google account test is claimed.
- Dependency audit reports zero vulnerabilities; live credential scan found no matches in committed project sources.

## Completed implementation

- Responsive Indonesian onboarding/status dashboard, read-only MCP workbench, secure Google consent start boundary and explicit disabled approval/executor state. The page never invents account/project data or approval IDs.
- Native stateless **MCP 2026-07-28** subset: server/discover, ping, tools/list, tools/call, metadata and mirrored headers, resultType, JSON-RPC errors and notification acknowledgement. Legacy 2025-11-25/2025-06-18/2025-03-26 remain served by the official SDK. Optional streaming, subscriptions, sampling and elicitation are not advertised.
- Project/IAM, Compute, Cloud Run/revisions, Storage, Cloud SQL, bounded Logging and project billing read tools with strict schemas and user/project authorization.
- Opt-in project-scoped budget list tool. Default consent stays read-only; enabling budgets requires explicit `ENABLE_BUDGET_READ=true`, Google cloud-billing scope, billing.budgets.list and live consent. Account-wide/mixed-project budgets are excluded.
- Browser voice dictation and speech synthesis behind explicit user clicks. Transcripts never trigger tools, approvals or writes. Browser/provider support varies; recognition may use a browser-provider service. No paid AI audio service is invoked.
- OAuth state/PKCE/nonce, verified Google identity, contextual AES-GCM token encryption, refresh CAS and provider revoke; independent MCP JWT issuer/audience/expiry/scope/user validation.
- Internal exact-payload approval primitives, immutable tenant bindings, five-minute expiry, atomic single-use claim and append-only audit/security event triggers. These are NOT a completed human-consent UI or executor.

## Commands

Node.js 22+ required.

```sh
npm ci
npm test
npm audit
npm run build                  # Production-config dry run only
npm run build:development      # Development-config dry run only
npm run db:check               # Read-only; requires securely supplied runtime environment
npm run release:check          # Expected exit 2: production acceptance not passed
```

Local preview uses `pm2 start ecosystem.config.cjs` on port 3000 after build. Stop preview temporarily before PGlite tests on a low-memory sandbox. Never print secrets or put DSNs in command arguments. The approved migration has already been applied; do not reset, drop, edit its checksum or rerun unrelated DDL.

## Functional paths

| Method | Path | Actual behavior |
|---|---|---|
| GET | `/` | Public onboarding/status, read workbench and optional browser voice UI |
| GET | `/ui/app.js` | Same-origin UI script, no embedded secrets |
| GET | `/api/status` | Configuration booleans and protocol capabilities, no DB query or secret values |
| GET | `/health` | Liveness; productionReady=false, writesEnabled=false |
| GET | `/ready` | 503 until full valid runtime config and migrated schema are reachable |
| GET | `/.well-known/oauth-protected-resource` | External MCP authorization-server metadata when configured |
| POST | `/oauth/google/start` | Registered MCP bearer + same-origin JSON; browser-bound PKCE consent URL |
| GET | `/oauth/google/callback` | One-time state + browser binding + Google identity validation; tokens never returned |
| POST | `/connections/disconnect` | Same-origin bearer and explicit disconnect confirmation; provider revoke then token erasure |
| POST | `/mcp` | Independent authenticated MCP, both protocol eras; currently fails closed on deployed missing config |

## Architecture and storage

Only Neon PostgreSQL is the database of record. Required models: users, oauth_connections, oauth_states, projects, project_permissions, pending_operations, approval_records, audit_events, security_events, connector_settings; plus rate_limits and schema_migrations. Tenant predicates and composite FKs are implemented; no deployed RLS claim is made. Tokens are AES-GCM encrypted with a Worker secret key outside the DB. S3/AI Gateway credentials are not dependencies of Google OAuth or this MCP runtime.

## Remaining work / recommended next steps

Provision a restricted runtime role and bind only its DSN; configure Google client/redirect and independent MCP issuer/JWKS/audience; register test users/project grants through approved administration; verify real Google consent/refresh/revoke and actual MCP-client reads. Implement separately authenticated human confirmation plus audited, state-revalidated executor before enabling any Google write. Production WAF/retention/recovery/key-rotation reviews and real browser voice device checks remain outstanding. No broad 'finish everything' instruction authorizes arbitrary GCP production mutations.

See [implementation status](docs/IMPLEMENTATION-STATUS.md), [validation](VALIDATION.md), [Neon](docs/NEON-DATABASE-SETUP.md), [deployment](docs/CLOUDFLARE-DEPLOYMENT.md), [MCP](docs/MCP-INTEGRATION.md), [API](docs/API-REFERENCE.md), [OAuth](docs/GOOGLE-OAUTH-SETUP.md), [approval](docs/APPROVAL-WORKFLOW.md), [security](docs/SECURITY.md) and [tests](docs/TESTING.md).
