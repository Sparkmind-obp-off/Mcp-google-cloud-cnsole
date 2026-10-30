# Changelog

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
