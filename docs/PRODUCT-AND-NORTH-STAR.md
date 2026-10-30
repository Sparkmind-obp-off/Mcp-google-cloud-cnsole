# Product definition and North Star

Status: product specification for the existing Google Cloud Console Connector. This document does not claim the planned features are deployed.

## Product vision
Give an authorized operator a safe, auditable way to inspect their own Google Cloud environment through ChatGPT and other compatible MCP clients, without exposing cloud credentials to the model or browser.

## Primary user
A Google Cloud project owner or delegated operator who wants conversational, read-only visibility across projects and selected services.

## Core promise
"Ask about my authorized Google Cloud resources; receive current, permission-scoped answers with traceable evidence."

## North Star
**Successful, authorized, live read-only answers per active user per week**, where success requires:
- an authenticated MCP request;
- a registered user and explicit project grant;
- a real Google API response (not a fixture);
- correct project/tenant isolation;
- a recorded audit event;
- no credential disclosure or unauthorized mutation.

Do not optimize for raw tool-call volume, number of connected projects, or dashboard visits.

## Guardrail metrics
- Unauthorized cross-tenant reads: 0.
- Secret/token disclosure: 0.
- Unapproved cloud mutations: 0.
- Successful live reads with stale/unclear provenance: 0.
- Revoked-consent access succeeding: 0.
- Production release with failed critical security tests: 0.

## Product principles
1. Read-only by default; no write tools in MVP.
2. Explicit project allow-list; Google IAM and application grants are both required.
3. Fail closed when auth, database, consent, or configuration is missing.
4. Never fabricate projects, resources, approvals, or success.
5. Separate ChatGPT-to-MCP authentication from MCP-to-Google OAuth.
6. Keep operator-facing UI understandable in Indonesian, with clear status and recovery guidance.
7. Evidence before claims: distinguish mocked tests, local tests, deployed health, and real end-to-end reads.

## MVP outcomes
A user can authorize the MCP client, connect a Google identity, grant exactly one test project, and ask ChatGPT to list that project and selected resources. Every step is revocable and auditable.

## Explicit non-goals
- Google Cloud resource creation, modification, or deletion.
- Billing changes, account-wide billing visibility, or cost optimization actions.
- Organization-wide inventory unless separately designed and authorized.
- AI agents that autonomously operate infrastructure.
- Storing Google credentials in Pages, browser storage, prompts, or ChatGPT.
- Claiming official ChatGPT compatibility before a real client test passes.
