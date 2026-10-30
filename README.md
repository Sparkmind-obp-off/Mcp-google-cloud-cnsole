# Google Cloud Connector

Cloudflare-first MCP connector for Google Cloud Platform, using Google OAuth 2.0 and per-mutation approval.

## Current release status

This repository starts as an implementation scaffold. It is **not deployed** and does **not yet provide a production MCP OAuth connection**. Do not enter production credentials until the deployment and OAuth verification checklist is complete.

## Design goals

- Google OAuth 2.0 authorization-code flow with PKCE/state protection.
- Cloudflare Workers runtime and D1 metadata store.
- Encrypted refresh-token storage; secrets are Worker secrets, never committed.
- MCP tools for project discovery and selected configuration management.
- Every write follows preview -> explicit approval -> execution -> audit event.
- No broad destructive operations or silent privilege escalation.

## Planned operations

Read: list/get projects, inspect enabled APIs, read IAM policy, inspect OAuth client metadata where supported by the relevant Google APIs.

Write (approval-gated): enable a selected API and update a selected IAM binding only after showing the exact project, resource, member, role, and before/after state. High-impact IAM changes, project deletion, billing changes, organization policy changes, and credential/key creation are excluded from the initial release.

## Repository layout

- `worker/`: Cloudflare Worker and D1 schema.
- `docs/`: architecture, OAuth setup, threat model, deployment and validation.
- `plugin/`: ChatGPT plugin package source (not installable until a verified MCP endpoint and OAuth metadata exist).

## Never commit

Google OAuth client secrets, access/refresh tokens, service-account keys, Cloudflare API tokens, or production D1 data.

## Status

See [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) for the verified state and next gates.
