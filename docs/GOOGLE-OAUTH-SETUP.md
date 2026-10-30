# Google OAuth setup — live verification BLOCKED

No Google client ID/secret or authorized test account was available during implementation. Tests use a mock Google token endpoint and mock ID-token verifier; signed JWT validation is separately tested locally. This is not a successful live consent test.

## Operator setup

1. Select a dedicated Google Cloud project, configure Google Auth Platform consent/audience and add a controlled test user. Follow Google's verification requirements for the requested scopes.
2. Create a Web application OAuth client. Provision `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Worker secrets through the provider dashboard or secure CLI stdin.
3. Choose the final HTTPS Worker origin. Configure `APP_ORIGIN` (no trailing slash) and exactly `GOOGLE_REDIRECT_URI=${APP_ORIGIN}/oauth/google/callback`. Add that exact URI to the Google client's authorized redirect URIs. Do not guess the deployed address.
4. Provision `TOKEN_ENCRYPTION_KEY` and Neon schema, plus the independent MCP JWT issuer/JWKS/audience. Register the user's external `(auth_issuer,auth_subject)` in the database through reviewed administration.
5. From an authenticated same-origin browser client, POST JSON `{}` to `/oauth/google/start` with its MCP bearer token. The response returns a Google authorization URL and sets a short-lived secure browser cookie. Navigate that same browser to the URL. There is no login/onboarding UI in this release; one must be supplied before end-user use.
6. Complete consent. Callback consumes state once, verifies Google identity/nonce, encrypts tokens with user/connection AAD and returns a plain success message. No tokens are sent to the browser.
7. Review the connection through `gcp_get_connection_status`, then explicitly provision allowed project rows and `read` permission rows. These grants do not confer Google IAM permissions.
8. Verify actual access-token expiration/refresh, denied consent, invalid state, repeat callback, revoked grant and disconnect against test accounts. Preserve only redacted evidence.

## Scope policy

Only `openid email https://www.googleapis.com/auth/cloud-platform.read-only` is requested. Broad write scope `cloud-platform` is NOT requested. Offline access is requested with consent for a refresh token; missing refresh token or read scope fails closed. The request includes S256 PKCE; provider acceptance must be verified live for the selected Web client.

## Token lifecycle

Access and refresh tokens are stored together encrypted, never plaintext. On refresh, a newly rotated refresh token is preserved and conditional DB replacement prevents stale overwrites. Explicit same-origin POST `/connections/disconnect` with `{connectionId,confirm:"disconnect"}` revokes at Google before removing stored usable tokens. Provider revocation failure retains ciphertext so the operator can retry; it does not pretend disconnection succeeded.

Google OAuth is NOT MCP-client authentication. Configure the external authorization server separately. OAuth consent is NOT a Google IAM grant or evidence an API is enabled.

Official references:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/getIamPolicy
