# Google Cloud Console Connector

Cloudflare Worker + Neon PostgreSQL connector for Google Cloud, with a stateless MCP read transport and a fail-closed write boundary.

**Release: 0.2.0 development, NOT production-ready. No production deployment was performed.** Live Neon read-only connectivity is verified; its connector schema is not yet migrated. Google integration is implemented but not verified against live authorized accounts. All Google Cloud writes remain disabled. See [implementation status](docs/IMPLEMENTATION-STATUS.md).

## Completed and verified locally

- Worker build, 25 automated tests, PostgreSQL schema/tenant constraints using isolated PGlite, MCP initialize/discovery/invocation using the official SDK.
- Google OAuth state, PKCE S256, browser binding, ID-token issuer/audience/nonce validation, AES-256-GCM token storage, refresh compare-and-swap and revocation code; provider interactions tested with mocks.
- Independent MCP JWT authentication via configured external authorization server, issuer/audience/expiry/scope verification, registered-user lookup.
- Strict-schema read tools for projects/IAM, Compute, Cloud Run/revisions, Storage, Cloud SQL, bounded Logging and project billing association.
- Approval persistence primitives, canonical payload/state hashes, expiry, atomic single-use claim and append-only audit triggers. These primitives are NOT exposed as approval/execution tools.
- PostgreSQL migration tracking/checksums, advisory lock, transaction rollback and an explicit apply gate.

## Run and verify

Requires Node.js 22+.

```sh
npm ci
npm test
npm run build                  # Cloudflare Worker dry-run; does not deploy
npm audit
npm run db:check               # Read-only; requires securely configured DATABASE_URL
npm run release:check          # Expected exit 2 until all release gaps are implemented and verified
```

Local preview uses `pm2 start ecosystem.config.cjs` after build, on port 3000. `/health` works without secrets; `/ready` intentionally returns 503 without complete configuration and a migrated database. The local preview is not a deployed Cloudflare Worker. No production URL currently exists.

Development health preview (temporary sandbox): https://3000-ivp9d07btcp0p55ymoi5g-3c7ff1b5.sandbox.novita.ai/health — verified HTTP 200. Its `/ready` endpoint returns the expected 503 because provider configuration is absent.

## Functional entry URIs

| Method | Path | Behavior |
|---|---|---|
| GET | `/health` | Public liveness, explicitly `productionReady:false`, no secret/config disclosure |
| GET | `/ready` | 503 when configuration/database is unavailable; never claims production acceptance |
| GET | `/.well-known/oauth-protected-resource` | Metadata pointing to an external MCP authorization server; no local token issuer |
| POST | `/oauth/google/start` | Registered user's bearer JWT + exact APP_ORIGIN + JSON `{}`; sets HttpOnly binding cookie, returns Google authorization URL |
| GET | `/oauth/google/callback?state=...&code=...` | Consumes state with binding cookie, validates identity, encrypts tokens; never returns tokens |
| POST | `/connections/disconnect` | Same-origin bearer JWT + `{connectionId,confirm:"disconnect"}`; revokes at Google, then erases stored tokens |
| POST | `/mcp` | Bearer JWT, JSON-RPC, Accept JSON and SSE; stateless SDK transport |

Tool arguments and errors: [API reference](docs/API-REFERENCE.md). All GCP project reads require an administrator-selected project grant AND actual Google OAuth scopes/IAM/API access.

## Architecture and storage

- Primary database: **Neon PostgreSQL**, using the Neon HTTP serverless driver. No D1 or secondary database.
- `database/migrations/001_initial.sql`: UUIDs, tenant-composite FKs, timestamptz, all ten required tables plus persistent rate counters.
- Credentials are supplied through Worker secrets, never in the tracked Wrangler config. S3 and AI Gateway credentials are not database credentials and are not runtime dependencies of this connector.
- Google access and refresh tokens are encrypted with contextual AES-GCM; the encryption key remains outside the database.
- The original plugin package is retained, but it is NOT an installable/verified ChatGPT connection.

## Not implemented / not verified

- Approved Neon migration, restricted runtime database role/secret binding, live Google OAuth/refresh/revoke, real Google API reads, actual MCP client connection. Live Neon HTTP/WebSocket connectivity is verified: neondb/public, PostgreSQL 18.6, no connector tables present.
- Native latest MCP 2026 request-metadata protocol; installed SDK supports negotiated revisions through 2025-11-25.
- Human approval UI/authorization channel, Google write executor, Cloud Run/bucket writes, budget reads, voice functionality.
- Built-in MCP authorization server, browser login/onboarding UI, automated user/project administration, production release approval.

## Recommended next steps

1. Rotate secrets previously shared in chat; provision Neon connection and Google/external MCP OAuth secrets securely.
2. Read-only Neon connectivity is verified. Obtain explicit approval for the initial migration on neondb/public; preserve existing neon_auth tables and separately approve/provision a restricted runtime role. The supplied administrative role is too broad for runtime.
3. Configure external MCP OAuth authorization server, provision registered users and project allowlists, complete live Google consent and read tests on an isolated project.
4. Add independently authenticated human approval and verified write execution, then run controlled tests before any production release.
5. Review and approve the exact Worker deployment only after release gates pass.

## Repository and deployment

- GitHub: https://github.com/Sparkmind-obp-off/Mcp-google-cloud-cnsole
- Branch: `main`.
- Backend target: existing **Cloudflare Workers** architecture in the user's own account (BYOK), not a new Pages app.
- Cloudflare authentication was verified; the target Worker did not exist during inspection. No Worker, bucket, database or GCP resource was created/modified remotely.
- Setup: [Google OAuth](docs/GOOGLE-OAUTH-SETUP.md), [Neon](docs/NEON-DATABASE-SETUP.md), [Cloudflare](docs/CLOUDFLARE-DEPLOYMENT.md), [MCP](docs/MCP-INTEGRATION.md), [security](docs/SECURITY.md), [testing](docs/TESTING.md).
