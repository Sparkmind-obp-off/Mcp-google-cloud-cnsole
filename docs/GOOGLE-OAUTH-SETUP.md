# Google OAuth setup

This document is a setup checklist, not proof that OAuth is configured.

1. Create or select a Google Cloud project dedicated to this connector.
2. Configure the Google Auth Platform consent screen and publishing/audience settings appropriate for the intended users.
3. Create an OAuth Client ID of type Web application.
4. After the Worker is deployed, add the exact callback URL shown by its deployment configuration to Authorized redirect URIs. Do not guess the URL.
5. Configure only the scopes required by the implemented tools. The initial Google Cloud delegated scope may require `https://www.googleapis.com/auth/cloud-platform`; request it only when the user enables the write-capable release and understands the access.
6. Store the client ID and client secret as Cloudflare Worker secrets. Never commit them or paste them into chat.
7. Test consent, callback state validation, token exchange, identity binding, refresh, revocation and failure cases using a non-production Google account/project.
8. Separately configure ChatGPT's OAuth connection to the MCP authorization server after that server's endpoints and metadata are implemented and verified.

Important: Authorized JavaScript origins and Authorized redirect URIs are different fields. Add an origin only if the implemented browser flow actually uses it. Do not enable unrelated APIs merely because they sound OAuth-related.
