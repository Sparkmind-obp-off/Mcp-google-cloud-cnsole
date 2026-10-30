# Cloudflare deployment checklist

Deployment is intentionally not automated by this repository initialization.

## Prerequisites

- Cloudflare account and Workers permission.
- A D1 database created specifically for this connector.
- A stable Worker hostname and HTTPS origin.
- Google OAuth Web client configured with the exact deployed callback.
- A separately designed and verified MCP OAuth authorization server.

## Configure

1. Create D1 database and apply `worker/schema.sql`.
2. Update `worker/wrangler.toml` with the real D1 database ID and deployed origin.
3. Add Google OAuth client ID, client secret and token-encryption key using Worker secrets.
4. Configure allowed origins and exact redirect URLs.
5. Deploy only after the worker has complete auth, storage, MCP and approval implementations.
6. Verify `/health`, OAuth metadata, protected-resource metadata, consent callback, token refresh/revocation, MCP initialize, tools/list and tools/call.
7. Test preview, approval, duplicate confirmation, expired confirmation, stale-state rejection and audit log in a non-production project.

Do not deploy the current scaffold as a production connector: `/mcp` deliberately returns HTTP 501.
