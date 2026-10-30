# Changelog

## 0.3.0 — 2026-10-30 (BYOK development deployed, not production-ready)

- Applied specifically approved 001_initial.sql to live neondb/public with checksum verification: 12 public tables; nine neon_auth tables preserved; no seeds or role changes.
- Added native MCP 2026-07-28 synchronous discovery/ping/tool subset, per-request metadata/header/error/result semantics and shared legacy SDK registry.
- Added explicit-opt-in project-exclusive budget reads; scope/IAM/account/project guards tested with mocks, deployment keeps flag disabled.
- Added responsive onboarding/status/read workbench and optional browser dictation/speech synthesis; no auto-execution, no paid AI audio, no fake approval IDs or account data.
- Expanded automated suite from 25 to 42 passing tests, kept dependency audit clean and scanned source for actual uploaded credentials.
- Pushed application to requested MainFunc branch; main not overwritten. Deployed google-cloud-connector-development version 1f17e7b3-c06f-448d-92ca-7e77dbdf15bd at https://google-cloud-connector-development.sparkmind-support.workers.dev .
- Verified HTML/JS/health/status 200 and expected fail-closed readiness/MCP behavior; final browser load has zero console messages.
- No runtime admin DSN or Google/AI/S3 credentials deployed. Restricted runtime role, real Google/MCP-client tests, human consent/executor and production acceptance remain outstanding.

## 0.2.0 — 2026-10-30 (development, not deployed)

- Audited original 13-file Worker scaffold and preserved repository/plugin structure.
- Replaced placeholder D1 architecture with Neon HTTP PostgreSQL access and versioned migration procedure.
- Added UUID/composite tenant constraints, encrypted OAuth storage, internal approval/audit structures and append-only/immutability triggers.
- Implemented Google OAuth PKCE/state/browser/identity boundary, contextual token encryption, conditional refresh and explicit provider revocation.
- Added independent external MCP JWT auth, strict schemas, stateless official SDK transport and read-only Google API registry.
- Added input/output bounds, origin/host checks, safe error mapping, persistent rate counters and known-sensitive-field redaction.
- Added 25 automated tests, isolated PostgreSQL execution, Worker dry-run build and clean dependency audit. Updated vulnerable Zod 3 to 4.6.7.
- Kept all Google writes disabled; internal approval primitives do not constitute a human approval UI or executor.
- Documented missing live credentials, latest-native MCP gap, lack of actual client verification and production release blockers.
- No production Worker deploy, remote DB migration, GCP mutation, S3 write or AI inference was executed.

## 0.1.0 — original scaffold

Worker liveness/incomplete Google OAuth exchange, D1 schema placeholders, disabled MCP endpoint and initial plugin/documentation source. Not a working production connector.
