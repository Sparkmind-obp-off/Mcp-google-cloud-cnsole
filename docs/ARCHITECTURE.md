# Architecture

## Components

- ChatGPT MCP client: discovers tools and invokes read or approval-gated write operations.
- Connector Worker: Cloudflare Worker; validates MCP requests, owns approval state, calls Google APIs.
- D1: OAuth state, encrypted token records, pending mutation approvals, and audit metadata.
- Google OAuth 2.0: user consent and delegated authorization to Google Cloud APIs.
- Google Cloud APIs: Resource Manager, Service Usage and Cloud Resource Manager IAM.

## Separate trust boundaries

There are two different OAuth concerns:

1. Google OAuth: grants the connector delegated access to the user's Google Cloud resources.
2. ChatGPT-to-MCP OAuth: authenticates the ChatGPT client to the connector.

A Google OAuth callback alone does not implement the MCP authorization server. The plugin must not be configured with guessed OAuth endpoints or a placeholder MCP URL. The final deployment needs standards-compliant authorization-server metadata, protected-resource metadata, PKCE, client registration or an explicitly supported client configuration, token issuance, refresh/revocation, and audience validation.

## Write approval state machine

`DRAFT -> PREVIEWED -> APPROVED -> EXECUTED`

- Preview includes operation, project, target, exact payload, current state, proposed state, impact and expiry.
- Approval is a separate user action and applies only to that preview's immutable payload hash.
- Execution rechecks the current resource state and authorization; stale previews are rejected.
- Confirmation tokens are single-use, short-lived, actor-bound and project-bound.
- Every outcome is audited. Secrets and access tokens are never logged.

## Initial write allowlist

Only narrowly scoped operations should be added after the approval layer is tested, such as enabling one named API on one explicitly selected project or adding/removing one explicitly named IAM binding after showing the exact before/after policy.

Never implement arbitrary Google API proxying. Exclude project deletion, billing changes, organization/folder policy, service-account key creation, disabling security controls, and privilege-escalation patterns from the initial release.
