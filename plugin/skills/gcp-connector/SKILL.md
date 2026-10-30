---
name: gcp-connector
description: Use when the user wants to inspect or manage Google Cloud projects, OAuth configuration, APIs, IAM, or service settings through Google Cloud Connector.
---

# Google Cloud Connector

The repository package is not a live connection until its MCP server is deployed, OAuth metadata is verified, the plugin is connected, and a Google account grant is active.

## Read operations

- Confirm the connected Google identity and selected project before reading project-scoped data.
- Explain which Google API and permission are needed.
- Never imply that Google Ads access equals Google Cloud Console access.

## Write operations

Every mutation requires its own preview and explicit confirmation. The preview must show:
- exact project and resource;
- operation and API method;
- current state and proposed state;
- exact member/role or API name, where applicable;
- impact, expiry and rollback considerations.

After approval, recheck current state, execute once, and record an audit event. A prior approval never authorizes a different payload or a later action.

## Never expose

Client secrets, refresh/access tokens, service-account private keys, passwords, OTPs or authorization codes.

## High-impact actions excluded from the initial release

Project deletion, billing changes, organization/folder policy changes, service-account key creation, disabling security controls, and broad privilege escalation.
