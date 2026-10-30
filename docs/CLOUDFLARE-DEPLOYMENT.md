# Cloudflare BYOK deployment

## Actual development deployment — PASS

- Account path: user's own Cloudflare BYOK token, not Genspark Hosted and not a newly converted Pages app.
- Worker: `google-cloud-connector-development`.
- URL: https://google-cloud-connector-development.sparkmind-support.workers.dev
- Version ID: `1f17e7b3-c06f-448d-92ca-7e77dbdf15bd`.
- Deployed application commit: `d24add4245b31bf26db2b5f338501c84207aa988` on requested branch `MainFunc`.
- Build/upload: approximately 1.68 MiB raw / 323 KiB gzip; reported startup 44 ms.
- No production Worker publish, custom domain or runtime secret provisioning was performed.

Commands actually executed after BYOK setup, whoami and tests:

```sh
npm run build:development
npx wrangler deploy --config worker/wrangler.toml --env development
```

The pre-existing Cloudflare Workers architecture is preserved. The generic BYOK Pages helper does not require converting a Worker repository to Pages. `npm run build` remains a production-config dry run only. Meta cloudflare_project_name now records the development Worker name.

## Live endpoint verification

| Endpoint | Result |
|---|---|
| / | 200 HTML dashboard |
| /ui/app.js | 200 same-origin script |
| /health | 200, productionReady=false, writesEnabled=false, browser-optional voice |
| /api/status | 200, configuration booleans only; DB/Google/issuer unavailable |
| /ready | 503 CONFIGURATION_REQUIRED, intentionally |
| /.well-known/oauth-protected-resource | 503 AUTH_NOT_CONFIGURED |
| /mcp unconfigured | 503 CONFIGURATION_REQUIRED; no fake tool success |
| /mcp with untrusted Origin | 403 ORIGIN_NOT_ALLOWED |
| /operations/execute | 404 NOT_FOUND; no executor exists |

Browser verification of the final deployed page completed in 5.13 seconds with correct title and zero console messages. This is a UI load check, not a real Google OAuth, physical microphone or MCP-client connection test.

## Runtime configuration not yet provisioned

Tracked development vars contain only environment, exact public origin/redirect/audience and ENABLE_BUDGET_READ=false. The administrative Neon DSN was intentionally not installed on the public Worker. No S3/AI credentials are deployed because they are not dependencies of this connector.

Before enabling protected functionality, provision a restricted runtime DATABASE_URL, TOKEN_ENCRYPTION_KEY, GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, and independent MCP_AUTH_ISSUER/MCP_AUTH_JWKS_URL using approved provider administration and secure Worker secrets. Never paste values in chat, command arguments, logs or tracked files. Verify configured public origin/redirect/audience exactly. Budget reads additionally require deliberate opt-in, cloud-billing consent and billing.budgets.list.

Initial Neon migration is already applied and verified; role changes, runtime DSN, user/project grants and OAuth are separate outstanding operations/configuration. Do not create or broaden roles based only on a general instruction to finish.

## Production acceptance remains BLOCKED

`npm run release:check` deliberately exits 2. Required: restricted DB privileges/binding; real Google consent/refresh/revoke and IAM/API read tests; actual MCP-client interoperability; independently authenticated human approval + state-revalidated audited executor and individually approved test operation; WAF/rate/retention/key/backup security review. Only after these pass may a production release be claimed. A live development URL does not imply readiness, working account connectivity or working Google writes.

Local PM2 preview runs on port 3000 with development config after a build. Stop it temporarily for memory-intensive embedded PostgreSQL tests. Local previews and successful builds are not Cloudflare deployment evidence; the version ID and live checks above are.
