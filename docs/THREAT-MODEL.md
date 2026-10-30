# Threat model and safety controls

## Assets

Google OAuth client secret, refresh/access tokens, user identity, project metadata, IAM policies, pending write approvals and audit events.

## Required controls

- TLS only; secure, HttpOnly, SameSite cookies for browser sessions.
- OAuth state, PKCE verifier, nonce and exact redirect URI validation.
- Encrypt refresh tokens at rest with AES-GCM using a key supplied as a Cloudflare secret; rotate keys with a documented migration.
- Never store credentials in source, logs, exception messages or analytics.
- Authenticate and authorize every MCP request; bind connection records to verified Google subject.
- Strict project allowlist/selection; no implicit "all projects" mutation.
- Validate tool input against schemas and allowlisted Google API methods.
- Preview exact writes and require separate explicit approval per operation.
- Bind approval to actor, project, method, canonical payload hash and short expiry; single-use and idempotent.
- Re-read state before execution; reject stale preview.
- Audit success and failure, with redacted targets and no credentials.
- Rate-limit OAuth and mutation endpoints; protect against CSRF, replay, SSRF and confused-deputy attacks.
- Provide disconnect/revoke and token deletion.

## High-impact operations excluded

Project deletion, billing account changes, organization/folder policy changes, service-account private key creation/download, disabling security controls, and broad IAM grants such as Owner at organization/folder scope.
