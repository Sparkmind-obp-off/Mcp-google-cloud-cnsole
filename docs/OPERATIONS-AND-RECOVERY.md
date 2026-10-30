# Operations, deployment and recovery runbook

## Environment topology
Isolate Development, Staging and Production: separate Pages origin, Worker, Neon database/schema, Google OAuth client, MCP issuer/audience, encryption keys and secrets.

## Deployment split
- Pages: frontend static build.
- Pages Functions: UI routes and narrow presentation adapters.
- Dedicated Worker: MCP, Google OAuth, authorization and Google API adapters.
- Neon: application system of record.

## Release sequence
1. Install, tests, type checks, build, migration check, audit and release checks.
2. Review diff and migration plan.
3. Deploy Worker to development.
4. Verify /health (liveness) and /ready (dependency readiness).
5. Deploy Pages preview; verify routes/assets and secret-free bundle.
6. Run OAuth/MCP integration tests.
7. Perform one live read against a non-production GCP project.
8. Verify audit and tenant isolation.
9. Promote to staging only after development gates pass.
10. Production requires explicit owner approval.

## Monitoring
Track Worker availability/readiness, auth failures by reason, Google API/quota errors, OAuth/refresh failures, DB health, per-tool volume/latency/rate limits and audit write failures. Never log auth headers, OAuth codes/state, access/refresh tokens, DSNs or sensitive request bodies.

## Incident response
Disable affected tools/routes; revoke Google grant and MCP authorization; rotate affected secrets/keys; invalidate sessions; restrict project grants and review IAM; preserve redacted audit evidence; restore only after root cause, tests and explicit approval.

## Recovery
Before production define RPO/RTO, Neon backup/PITR, audit retention, key rotation/escrow, token re-encryption and restore procedure. Perform an isolated restore drill.

## Operator interpretation
/health 200 = process alive only. /ready 200 = required dependencies ready. /ready 503 is expected fail-closed state when prerequisites are missing. /mcp 503 must not be bypassed by weakening auth. Tool discovery does not prove Google access. Claim end-to-end success only after a live Google API read, audit event and negative grant test.
