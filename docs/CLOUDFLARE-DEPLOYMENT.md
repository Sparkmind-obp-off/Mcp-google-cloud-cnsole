# Cloudflare BYOK deployment status

**BLOCKED — production release intentionally withheld.** User selected their own Cloudflare account. `wrangler whoami` succeeded using the configured BYOK token. Inspecting deployments for `google-cloud-connector` returned Cloudflare code 10007 (Worker does not exist). No Worker was created or deployed, and no remote secrets were written. Token authentication is not proof that Workers Edit or every required permission is granted.

## Preserve the repository architecture

This repository is a **Cloudflare Worker**, not a Hono Pages project. It is deliberately not converted to Pages merely to satisfy a deployment shortcut. `npm run build` invokes `wrangler deploy --dry-run` and bundles the Worker without publishing it. `worker/wrangler.toml` retains the Worker name and has no D1 placeholder, no plaintext secrets, invocation logs disabled and a distinct development environment. Production ENVIRONMENT is not a release approval.

No custom domain was selected/configured. Do not assume a guessed workers.dev URL is live.

## Required configuration

Provision through Cloudflare Workers -> Settings -> Variables and Secrets or `wrangler secret put NAME --config worker/wrangler.toml --env=''` using secure stdin. Never print, commit or paste secret values.

- `DATABASE_URL`: Neon PostgreSQL runtime DSN, not S3 credentials.
- `TOKEN_ENCRYPTION_KEY`: base64url 32 random bytes.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `APP_ORIGIN`: exact final HTTPS origin.
- `MCP_AUTH_ISSUER`, `MCP_AUTH_AUDIENCE`, `MCP_AUTH_JWKS_URL`: independently configured external MCP authorization server.

`ENVIRONMENT` is tracked as production; sandbox PM2 selects the separate development environment. Runtime database access is over Neon HTTPS with no D1/KV binding. S3 and AI Gateway secrets are not deployed because they are not dependencies of the connector.

## Release gates BEFORE publishing

1. `npm ci`, `npm test`, `npm audit`, `npm run build` pass.
2. Approved Neon migration applied and real connection/role/tenant checks pass.
3. Google OAuth client, redirect URI and external MCP OAuth issuer/client setup verified against real accounts.
4. Real project read, IAM denial, API-disabled and scope failure tests pass.
5. Actual intended MCP client connects and discovers/invokes tools with negotiated protocol compatibility.
6. Separately authenticated human confirmation and audited executor are implemented and tested for controlled non-destructive writes, including races, stale state, expiry and unknown outcomes.
7. Native protocol/operational security gaps in IMPLEMENTATION-STATUS are resolved or explicitly reviewed as release limitations.
8. Obtain approval for the exact Worker target, configuration and code being published.

`npm run release:check` deliberately exits 2 today. Adding secrets alone does not make the implementation production-ready. Do not bypass it to advertise a successful deployment.

After acceptance and target approval, an operator may use `wrangler deploy --config worker/wrangler.toml --env=''` for this existing Worker architecture, then verify actual returned URL, `/health`, `/ready`, metadata, real OAuth callback, authenticated `/mcp`, real read operation and controlled approved write. These commands are a future procedure, not actions already performed. Configure Google callback and APP_ORIGIN to the exact observed deployment origin before end-user traffic.

## Local runtime verification

Build first, clear port 3000, then `pm2 start ecosystem.config.cjs`. Curl `/health` should return 200 with `productionReady:false`; `/ready` should return 503 without configuration. Public sandbox preview is development only, not BYOK production deployment. No service account keys, GCP mutations, S3 writes or AI calls are required for these tests.
