# Approval workflow — internal primitives only

**PARTIAL — implemented but not fully verified.** No production Google write operation can be called: no HTTP/MCP approval or execution endpoints are registered. Default Google scopes remain read-only; optional cloud-billing consent is only for the budget list tool and does not expose a mutation handler. There is no functioning human approval UI/channel yet. The deployed dashboard explicitly labels its approval section disabled, does not load a live pending list and does not fabricate approval IDs. Do not expose `ApprovalStore.decide` directly to an AI caller.

## What exists

`worker/src/approvals.js` validates narrowly scoped `compute.start` / `compute.stop` preview payloads (connectionId, projectId, operation, zone, instance). It computes canonical JSON SHA-256 payload and current-state hashes, formats the exact target and stores a five-minute preview with a UUID ID. These are internal library functions, not MCP tools. `executionEnabled:false` is returned explicitly.

The database binds each approval to operation, user, Google connection, project row, operation type, target, exact payload hash and expiry with composite foreign keys. Creation timestamp, status and consumption time are recorded. Triggers prevent changes to preview identity/payload/state/expiry and approval identity/decision or reuse after consumption.

`decide` conditionally transitions only an unexpired preview for the exact user/hash, inserts its single decision record and audit event in one SQL statement. `claim` conditionally transitions one approved operation to executing, consumes the matching approval and inserts a claim audit in one statement. A second concurrent claim, stale resource hash, expired record or changed hash cannot succeed. It does not call Google or mark a cloud operation succeeded.

`validateApproval` checks user/connection/project, status, consumed flag, expiry, normalized exact payload and supplied current-state hash. The executor must eventually fetch current state itself; accepting client-supplied current state is not acceptable for production.

## Verified locally

Isolated PostgreSQL tests cover cross-user decision denial, payload mutation rejection, immutable preview, exact hash, stale-state claim denial, concurrent claim/replay rejection, expired decision denial, audit persistence, append-only events and consumed approval immutability. Unit tests cover connection/project mismatch and exact payload/state/expiry validation. No real Google operation was executed.

## Required before enabling writes

1. Implement an independently authenticated human browser consent session with CSRF protection, not an AI bearer assertion or `approved:true` argument.
2. Show the exact Google identity, project, resource, action, normalized payload, expected effect/cost/risk, before state and expiry. Bind the human action to that immutable preview.
3. Recheck selected project permission, Google write scope and actual IAM; fetch current resource state at execution time and reject stale previews.
4. Atomically claim approval once; use provider idempotency/request IDs where supported. Do not automatically retry uncertain writes.
5. Implement status polling and result auditing (`succeeded`, `failed`, `unknown`) including provider asynchronous operation IDs without credentials. A lost/ambiguous result must not cause another write.
6. Verify on an explicitly approved controlled test project. Every individual live operation requires exact user approval; broad build/deploy instructions are not consent to start/stop/create resources.

No Cloud Run create/update, bucket create, IAM changes, API enabling, destructive operations, billing changes or privilege escalation are implemented. No public gcp_approve_operation, gcp_reject_operation or write-execute tool is advertised as available.
