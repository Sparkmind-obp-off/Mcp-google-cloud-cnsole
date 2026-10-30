# Frontend and UI/UX specification

## Hosting decision
Frontend is a Cloudflare Pages project. Pages Functions are limited to frontend application routes and safe presentation adapters. The dedicated Cloudflare Worker remains the backend and MCP server.

## Experience goals
- Indonesian-first, responsive desktop and mobile web.
- Calm operations-console visual language: clear hierarchy, compact status, readable tables, no fake live data.
- Show what is configured, what is blocked, and the next safe action.
- Never display raw access tokens, refresh tokens, DSNs, JWTs, client secrets or encryption keys.

## Information architecture
1. **Overview** — overall connection/readiness state, environment label, last verified check.
2. **Setup** — checklist for MCP authentication, Google OAuth, database runtime role, project grant.
3. **Google connection** — connected identity (redacted email), consent state, reconnect/disconnect.
4. **Projects** — only projects explicitly granted to the signed-in user; no invented demo rows.
5. **Read workbench** — safe examples of available read tools and their required project scope.
6. **Activity & audit** — redacted timestamps, action/tool name, project reference, outcome.
7. **Security** — read-only mode, disabled writes, session and credential safety notes.

## Status vocabulary
- Not configured
- Waiting for authorization
- Connected
- Needs attention
- Access denied
- Disconnected
- Verified (include evidence and timestamp)
Do not use "Live" unless the displayed datum was fetched from the live provider in the current verified flow.

## Key screens
### Overview
- Environment badge: Development / Staging / Production.
- Backend reachability and backend readiness are separate indicators.
- Show /health as liveness only and /ready as full readiness.
- Show "MCP client not verified" until actual client invocation succeeds.

### Setup checklist
- MCP identity provider configured.
- Restricted database runtime role installed.
- Google OAuth Web client configured with exact callback URI.
- Google identity consent verified.
- One test project grant provisioned.
- First live read passed.
Each item links to instructions and shows evidence timestamp.

### Project detail
- Project ID and display name from Google API only.
- Permission: read / none.
- Last successful sync/read timestamp.
- Do not expose projects outside user's explicit grants.

### Read workbench
- Tool list from backend capabilities; no hardcoded claim that a tool is enabled if config/API access is missing.
- User selects a project and read-only operation.
- Render source, project, fetched-at time, and any partial/error status.
- No arbitrary SQL, shell, URL fetch, or generic HTTP request interface.

### Connection controls
- Connect via explicit Google consent.
- Disconnect requires confirmation and successful provider revoke or a truthful partial-failure state.
- No token display or copy control.

## Accessibility and responsive behavior
- Keyboard navigable; visible focus; semantic headings and form labels.
- Contrast suitable for text and status indicators; never rely on color alone.
- Tables collapse to cards on narrow screens.
- Loading, empty, permission-denied and provider-error states have distinct copy.
- Do not autoplay audio or request microphone permission on page load.

## Pages Functions contract
Allowed examples:
- GET /ui/status — returns allow-listed status from backend.
- GET /ui/bootstrap — public feature flags and environment label.
- UI route fallback /setup, /projects, /activity.
These endpoints must not return secrets or raw provider tokens. If authenticated proxying is needed, use a narrowly scoped server-side credential and strict fixed upstream. Prefer direct browser-to-Worker calls for user-bound operations when the existing browser-binding/CSRF design requires it.

## Frontend acceptance
- Pages deployment loads all routes and assets.
- No secrets in build output, source maps, HTML or JS bundle.
- No arbitrary upstream proxy.
- Browser console has no uncaught errors.
- CORS/CSRF tests pass.
- Every displayed project/status is sourced from backend data or explicitly marked unavailable.
- Keyboard, mobile layout, empty/error states verified.
