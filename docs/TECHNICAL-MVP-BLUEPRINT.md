# Technical MVP blueprint

## Repository direction
Keep this repository as the backend connector source of truth. Frontend can remain in this repository under a clearly isolated `frontend/` directory for the Pages build, or move to a dedicated frontend repository only after deployment ownership is decided. Do not create a second MCP server.

Suggested target layout (adapt to existing paths; do not blindly rename working modules):

```text
/
  worker/                 # existing backend Worker and MCP implementation
  frontend/               # Pages static app source (planned extraction)
    public/
    src/
    functions/            # Pages Functions: UI-only routes/adapters
  migrations/             # existing Neon SQL migrations
  docs/
    SYSTEM-ARCHITECTURE.md
    FRONTEND-AND-UX.md
    BACKEND-MCP-SPEC.md
    DATABASE-DESIGN.md
    PRODUCT-AND-NORTH-STAR.md
    MVP-AND-ROADMAP.md
    TECHNICAL-MVP-BLUEPRINT.md
  wrangler.toml           # backend Worker config; Pages config separate
  package.json
```

## Environment contract

### Pages build/runtime
- `PUBLIC_BACKEND_ORIGIN`: non-secret backend HTTPS origin, if browser calls Worker directly.
- `PUBLIC_ENVIRONMENT_LABEL`: display-only environment label.
- Never place secret credentials or token encryption material in Pages variables.
- Pages Functions secrets, if any, are narrowly scoped UI proxy credentials only and must not equal backend admin credentials.

### Worker secrets/config
- restricted `DATABASE_URL` (secret)
- `TOKEN_ENCRYPTION_KEY` (secret)
- MCP issuer, audience/resource and JWKS URL (trusted configuration; protect signing key at issuer)
- Google OAuth client ID/secret (secret as appropriate)
- exact `APP_ORIGIN` and `GOOGLE_REDIRECT_URI`
- allowed Pages origin(s)
- optional budget flag disabled by default

Do not commit .env files or print secret values. Provision through Cloudflare secret management.

## API surface
Existing backend routes remain authoritative:
- `GET /health` — liveness only.
- `GET /ready` — runtime readiness.
- `GET /api/status` — redacted configuration and protocol capability booleans.
- `GET /.well-known/oauth-protected-resource` — MCP protected resource metadata when configured.
- `POST /oauth/google/start` — authenticated, browser-bound Google consent start.
- `GET /oauth/google/callback` — one-time validated callback.
- `POST /connections/disconnect` — explicit same-origin disconnect.
- `POST /mcp` — authenticated MCP endpoint.

Pages Functions must not shadow these backend paths on the Worker origin. UI route examples: `/setup`, `/projects`, `/activity`; optional UI adapters use `/ui/*`.

## Security controls
- Exact-origin CORS; no wildcard with credentials.
- SameSite/Secure/HttpOnly browser-binding cookies where applicable.
- CSRF state and PKCE for OAuth.
- Fixed upstream backend URL; no user-controlled proxy destination.
- Request size, method, content-type and rate limits.
- No secrets in browser bundle, logs, analytics or error text.
- Redact project/resource output according to minimum necessary data.
- Use per-environment keys, issuers, OAuth clients and databases.
- Restrict Google scopes to cloud-platform.read-only by default.

## Verification commands
Existing repo commands include `npm ci`, `npm test`, `npm audit`, `npm run build`, `npm run build:development`, `npm run db:check` and `npm run release:check`. Run these before and after any code extraction. Add Pages build/deploy preview and browser tests when frontend extraction begins.

## End-to-end acceptance checklist
1. Pages URL serves UI over HTTPS.
2. Worker /health returns 200.
3. Worker /ready returns 200 only with restricted runtime config and DB connectivity.
4. Pages contains no secrets; UI status is redacted.
5. MCP authorization discovery matches the actual configured issuer and resource.
6. ChatGPT authorization and MCP tool discovery succeed with the target plan/client.
7. Google OAuth consent, refresh and revoke work against a controlled account.
8. One explicitly granted project appears; an ungranted project is denied.
9. One real service read returns provider data and audit evidence.
10. Revoked consent or project grant blocks subsequent reads.
11. No write tools are exposed.
12. Security and recovery review passes before production.
