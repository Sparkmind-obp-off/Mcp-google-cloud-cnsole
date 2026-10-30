# MVP, roadmap and release gates

## MVP definition
A single authorized user connects one Google identity, receives access to one explicitly granted non-production project, and asks ChatGPT (or another verified MCP client) to list projects and at least one resource using real Google APIs. No write operations.

## Milestones

### M0 — Documentation and architecture lock
- Pages frontend / Pages Functions UI layer / dedicated Worker backend / Neon DB documented.
- Existing deployment and OAuth boundaries preserved.
- Acceptance criteria and blocked items explicit.
Exit: docs reviewed; no code behavior silently changed.

### M1 — Frontend separation
- Create Cloudflare Pages project from frontend build.
- Extract HTML/CSS/JS and UI routes from Worker root.
- Pages Functions only for UI routing and safe presentation adapters.
- Keep /mcp and all Google OAuth/token operations on dedicated Worker.
Exit: Pages UI works; Worker API and MCP remain independently reachable; no secrets in Pages output.

### M2 — Backend readiness
- Restricted Neon runtime role and secret binding.
- External MCP authorization server configured with compatible metadata/JWKS/audience.
- Google OAuth Web client and exact callback configured.
- Test user and one project grant provisioned.
Exit: /ready 200; protected-resource metadata correct; auth failures fail closed.

### M3 — Real read-only integration
- Complete Google consent with controlled test account.
- Verify refresh/revoke.
- Test ChatGPT custom MCP connection or another target client using its supported auth/transport.
- Execute gcp_list_projects and one service list against real GCP.
Exit: evidence shows real provider result, correct grant filtering and audit event; no mock result.

### M4 — Hardening and production decision
- Security review, CORS/CSRF, rate limits, restricted DB role, secret rotation.
- Recovery/backup and key rotation drill.
- Observability and incident runbook.
- Production-specific OAuth client, issuer, secrets and domain.
Exit: all critical tests pass and production release explicitly approved.

### Later, not MVP
- Multi-user self-service onboarding and admin console.
- More service read tools and inventory snapshots.
- Budget read after separate consent and scope decision.
- Alerts and scheduled read reports.
- Any write workflow only after independent security design and explicit authorization.

## Release gates
- Gate A: code and unit tests pass.
- Gate B: deployment health passes.
- Gate C: readiness and DB role verified.
- Gate D: OAuth lifecycle verified live.
- Gate E: real MCP client compatibility verified.
- Gate F: real Google API read verified.
- Gate G: security and recovery review complete.
Production is blocked until all mandatory gates pass.

## Current baseline (2026-10-30)
- Development Worker 0.3.0 deployed.
- Existing dashboard currently served by Worker; Pages extraction not yet verified.
- Neon migration applied; restricted runtime role/DSN not provisioned.
- External MCP issuer/JWKS and Google OAuth client not configured.
- /ready and /mcp intentionally return 503 in unconfigured deployment.
- Read tools implemented but Google API tests use mocks; no live GCP read verified.
- No production Worker/domain, no write executor.
