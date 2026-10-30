# Database design

## System of record
Neon PostgreSQL is the only application database. Existing migration `001_initial.sql` has been applied and must not be reset, rewritten or replayed as unrelated DDL. Existing `neon_auth` tables are preserved.

## Existing logical entities
- users: application identity linked to trusted external MCP issuer + subject.
- oauth_connections: Google identity and encrypted token material.
- oauth_states: one-time OAuth state, nonce, PKCE and browser binding metadata.
- projects: known Google Cloud project references.
- project_permissions: user-to-project permission grants.
- pending_operations: reserved future operation records; not an MVP write interface.
- approval_records: approval primitives; not proof of a complete consent UI.
- audit_events: append-only business/security-relevant outcomes.
- security_events: authentication and policy events.
- connector_settings: non-secret application configuration.
- rate_limits: bounded request counters.
- schema_migrations: applied migration ledger.

The current deployed schema is documented as 12 public tables plus 9 preserved neon_auth tables. Consult the committed SQL migration as the authoritative column/index/constraint definition; this document intentionally describes logical responsibilities rather than inventing column names.

## Required invariants
- A user identity is unique within its trusted issuer.
- A Google connection belongs to exactly one application user.
- A project grant is scoped to one user and one project.
- Every project read checks the grant on every request.
- Foreign keys and composite constraints prevent cross-user connection/grant mixups.
- OAuth state is one-time and expires.
- Refresh-token rotation uses conditional update/CAS to prevent stale overwrites.
- Audit/security records are append-only for application roles.
- No token is stored in plaintext.
- No browser or ChatGPT response includes a token or database credential.

## Runtime database role
- Provision a dedicated restricted runtime role; do not deploy the administrative DSN.
- Grant only required schema/table/sequence privileges.
- Deny DDL, role management, database creation and broad ownership.
- Test runtime behavior with that role, including forbidden operations.
- Store DSN as a Worker secret; never in Pages build variables or source.
- Rotate any credential previously shared outside its secret manager.

## Encryption
Google OAuth access/refresh tokens are encrypted at application layer using a Worker secret key and connection/user-associated context. Key rotation and recovery must be documented and tested before production. Never log ciphertext unnecessarily or log plaintext.

## Backups and retention
Before production define Neon backup/PITR policy, recovery point/time objectives, audit retention, deletion policy and user disconnect semantics. Verify restore in an isolated environment. Do not claim recovery readiness based on provider defaults alone.

## Data minimization
Persist only fields required for project authorization and audit. Avoid storing full log payloads, secrets, personal data or unnecessary resource configuration. Bound log queries and redact sensitive fields before returning or storing.
