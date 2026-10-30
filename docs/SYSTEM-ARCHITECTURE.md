# System architecture

Status: target architecture and migration boundaries for the existing implementation.

## Locked deployment split

```text
Browser
  |
  v
Cloudflare Pages (frontend origin)
  |-- Static assets: HTML, CSS, JS, icons
  |-- Pages Functions: UI routes + safe same-origin presentation endpoints
  |
  | HTTPS to configured backend origin
  v
Cloudflare Worker (backend / MCP resource)
  |-- /mcp (MCP protocol + tool registry)
  |-- /oauth/google/* (Google consent lifecycle)
  |-- /api/* (backend status and connection operations, authenticated)
  |-- independent MCP bearer validation
  |-- project/tenant authorization
  |-- Google API adapters (read-only)
  |-- audit/security events
  |
  +---- Neon PostgreSQL (system of record)
  |
  +---- Google OAuth + Google Cloud APIs
  |
  +---- External MCP Authorization Server (ChatGPT/client authentication)
```

## Responsibilities

### Cloudflare Pages
- Serves the user interface and static assets.
- Owns frontend build/deploy and browser-facing navigation.
- Contains no Google client secret, database DSN, token-encryption key, MCP signing key, or Google access token.
- Does not implement Google API business logic.

### Pages Functions — frontend application layer
- Handle frontend-specific routes and safe presentation adapters only.
- May provide a same-origin status proxy or UI bootstrap endpoint that calls the backend Worker using a narrowly scoped server-side service credential, if needed.
- Must not become a second MCP server, duplicate OAuth implementation, or expose privileged backend credentials.
- Must not accept arbitrary upstream URLs; backend origin is fixed by deployment configuration.
- Validate method, origin, content type, payload size, and rate limits.
- Return only allow-listed, redacted UI data.

### Dedicated Cloudflare Worker — backend
- Remains the only MCP server and authoritative backend.
- Validates MCP bearer JWT issuer, audience/resource, expiry, scope, and registered subject.
- Enforces user/project grants on every tool call.
- Owns Google OAuth start/callback/disconnect and encrypted token lifecycle.
- Calls fixed Google API hosts through schema-validated adapters.
- Persists users, connections, grants, operations, audit and security events in Neon.
- Fails closed when required configuration or database access is unavailable.

### Neon PostgreSQL
- Single system of record.
- Application runtime uses a restricted database role, never an admin DSN.
- Google tokens encrypted at application layer before storage.
- Tenant ownership enforced in queries and relational constraints; review RLS separately before claiming it.

### External MCP authorization server
- Issues ChatGPT/client-to-MCP credentials.
- Must support a flow actually accepted by the target ChatGPT custom MCP integration.
- Its issuer/JWKS/audience/resource must match Worker validation.
- It is independent from Google OAuth. Google tokens are never MCP bearer tokens.

## Request flows

### ChatGPT MCP read
1. ChatGPT obtains an MCP bearer token from the configured MCP authorization server.
2. ChatGPT sends a request to Worker /mcp.
3. Worker validates token and maps subject to an enabled application user.
4. Tool validates project grant and required permission.
5. Worker obtains/refreshes encrypted Google OAuth token.
6. Worker calls the relevant Google API and validates the response.
7. Worker records audit metadata and returns the minimum necessary result.

### Browser Google consent
1. User opens Pages frontend.
2. Pages UI calls the backend Worker using the approved browser-bound flow.
3. Worker verifies MCP identity, creates state + PKCE + nonce and browser binding.
4. User consents at Google.
5. Worker callback validates state, browser binding and Google identity.
6. Tokens are encrypted and stored in Neon; tokens are never returned to the browser.
7. User receives a redacted connection status.

## Origins and CORS
- Prefer a single Pages origin for browser UI.
- Worker allows only the exact configured Pages origin; no wildcard credentialed CORS.
- MCP client requests are not authenticated by browser CORS.
- CSRF protection and browser binding remain required for cookie-based OAuth callbacks.
- Configure separate development and production origins, secrets and audiences.

## Deployment environments
- Development Pages + development Worker + isolated test DB/project.
- Staging only after development end-to-end acceptance.
- Production only after security, recovery, OAuth and ChatGPT-client acceptance.
- Never reuse development bearer issuers, OAuth clients, encryption keys or DB credentials in production.

## Migration rule
The current Worker serves a dashboard at /. Keep the existing deployment stable while extracting UI assets/routes to Pages. Do not delete or repurpose the existing Worker root until Pages is deployed and verified. The MCP endpoint remains on the dedicated Worker.
