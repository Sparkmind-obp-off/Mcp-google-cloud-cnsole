# ChatGPT direct MCP connection — gated setup and acceptance

Status: **BLOCKED for this ChatGPT Free account; NOT CONNECTED.** This document describes the supported direct path and the exact gates to test it. Do not treat a successful Worker deployment as a ChatGPT connection.

## 1. ChatGPT plan gate (check first)

OpenAI's current Help Center says custom remote MCP connections are available on ChatGPT Business and Enterprise/Edu on web. Pro users can connect custom MCP servers with read/fetch permissions, but full MCP/write support is currently limited to Business and Enterprise/Edu. Free is not listed as eligible.

Therefore:
- On this user's currently detected **Free** plan, do not expect a custom MCP server connector to be available. There is no endpoint or code workaround for a product-plan entitlement.
- For a read-only direct test, use a ChatGPT Pro account if the account UI exposes custom MCP connections/developer mode.
- For full MCP capability, use a Business workspace (admin/owner creates and publishes) or Enterprise/Edu (admin/owner, or an RBAC-authorized developer for private testing).
- Use ChatGPT web, not mobile, for setup.
- Re-check the Help Center and the actual account UI before purchase or migration; availability can change.

Official source: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## 2. Server readiness gate — current state

Development MCP endpoint:
https://google-cloud-connector-development.sparkmind-support.workers.dev/mcp

Before attempting ChatGPT setup, all of these must be true:
- `GET /health` returns 200 (liveness only; not sufficient).
- `GET /ready` returns 200 (runtime config + database ready).
- `GET /.well-known/oauth-protected-resource` advertises the configured independent MCP authorization server and protected resource.
- `POST /mcp` accepts the selected ChatGPT-supported MCP protocol after a valid MCP bearer token is obtained through the external authorization server.
- Google OAuth Web client is configured separately, with exact redirect URI:
  `https://google-cloud-connector-development.sparkmind-support.workers.dev/oauth/google/callback`
- A restricted Neon runtime role/DSN is installed; do not install the administrative DSN.
- A test user is registered and granted read access to exactly one controlled Google Cloud project.
- Google OAuth consent, refresh and revoke have been tested against a controlled Google account.
- No write tools are registered or enabled.

The last verified deployment record (0.3.0, 2026-10-30) explicitly says /ready and /mcp return 503 until configuration is provisioned; external MCP issuer/JWKS, Google OAuth client, runtime restricted DB role, registered users and project grants were not configured. Actual Google APIs were tested with mocks only. Re-verify live endpoints before relying on this historical state.

## 3. Keep the two OAuth trust boundaries separate

A. **ChatGPT → MCP Server authentication**
- ChatGPT must obtain a token from an independent authorization server trusted by the MCP resource.
- The token must match the MCP issuer, JWKS, audience/resource and required scope, and map to a registered enabled user.
- Google access, refresh or ID tokens are not MCP bearer credentials.

B. **MCP Server → Google Cloud authentication**
- The user separately completes Google OAuth consent.
- Request only the read-only Google Cloud scope by default.
- Google tokens remain encrypted in Neon and are never returned to ChatGPT or the browser.
- The selected project must have an explicit application-level read grant and the Google identity must have the necessary Google IAM permissions.

Do not invent authorization/token endpoints or reuse unrelated OAuth/Clerk credentials.

## 4. ChatGPT setup (only after plan and server gates pass)

On ChatGPT web, use the current custom Plugins flow when it is available to the account/workspace:
1. Open **Plugins → + → Add custom MCP server**.
2. Enter the server name and HTTPS MCP endpoint.
3. Configure the authentication flow supported by ChatGPT and implemented by the MCP authorization provider.
4. Acknowledge the security notice, create the plugin and review its discovered tools.

Some legacy custom-app/workspace experiences may instead expose **Settings → Apps** or an Apps/Create flow. Follow the UI actually available to the account. The current Plugins add-custom-MCP flow does not require enabling Developer Mode first; do not add that as a universal prerequisite.
4. Name it `Google Cloud (Read Only)`.
5. Enter the remote HTTPS MCP endpoint:
   `https://google-cloud-connector-development.sparkmind-support.workers.dev/mcp`
6. Configure the authentication mechanism offered by ChatGPT to match the MCP authorization server's supported OAuth metadata/flow. Do not paste a Google token, Neon DSN, client secret or Worker secret into the app's endpoint field.
7. Review the risk notice and create/test the app. Complete the MCP authorization prompt.
8. Scan the tools. Confirm that only read tools appear.
9. Start a new chat, select the app, and run the acceptance prompts below.

If ChatGPT's UI does not expose custom MCP creation, stop. That is a plan/workspace permission gate, not a Worker bug.

## 5. End-to-end acceptance test

Use a dedicated test project with no production workloads. Record only timestamps, HTTP status, tool names and redacted results.

| Test | Prompt / action | Pass condition |
|---|---|---|
| A | Add the app and complete OAuth | ChatGPT completes MCP authorization; no manual bearer paste |
| B | Ask: "List Google Cloud projects I am authorized to access." | Tool call returns only the explicitly granted project(s) |
| C | Ask: "Show Compute Engine instances in project [test project]." | Real Google API result; not mock/fixture data |
| D | Ask: "List Cloud Run services in project [test project]." | Real Google API result, or a precise API/IAM-disabled error |
| E | Revoke Google consent, then repeat B | Access fails closed; no stale-token success |
| F | Disconnect/re-authorize and repeat B | Consent lifecycle works; no duplicate or cross-tenant access |
| G | Ask to create/delete/update a cloud resource | No write tool is available; no mutation occurs |

A pass requires actual tool invocation through ChatGPT and a real Google API response. A dashboard status, local unit test, mocked API response, MCP initialize alone, or HTTP 200 on /health is not an end-to-end pass.

## 6. Frontend/backend deployment boundary

The planned deployment split is Cloudflare Pages for the frontend, Pages Functions for frontend routing and safe presentation adapters, and the existing dedicated Cloudflare Worker for the MCP backend, Google OAuth and Google API access. Pages Functions are not a second MCP server. The current 0.3.0 development dashboard is still served by the Worker; Pages extraction has not yet been deployed or verified. See `SYSTEM-ARCHITECTURE.md` and `TECHNICAL-MVP-BLUEPRINT.md`.

## 7. Current implementation boundary

The existing MainFunc branch implements a read-oriented MCP registry, legacy SDK transport and a synchronous native protocol subset. It does not yet have live ChatGPT client interoperability evidence. The deployed runtime is intentionally fail-closed while its issuer, restricted DB role and Google OAuth configuration are absent. Human approval UI and Google write executor are not implemented. Keep all writes disabled until a separate reviewed design and explicit per-operation approval exist.

## 8. Official references

- ChatGPT custom MCP setup and plan availability: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- OpenAI Apps SDK: https://developers.openai.com/apps-sdk/
- OpenAI MCP guide: https://developers.openai.com/api/docs/mcp/
- MCP specification: https://modelcontextprotocol.io/
