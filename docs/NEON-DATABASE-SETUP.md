# Neon PostgreSQL setup

**Live connection: PASS. Migration/runtime provisioning: BLOCKED pending explicit approval/configuration.** Credentials from the subsequent user upload successfully connected to `neondb` over both the Neon HTTP and WebSocket transports. Password/DSN were neither logged nor persisted into tracked files. Read-only inspection confirmed active schema `public`, PostgreSQL 18.6, zero tables in public and no migration tracker. Existing `neon_auth` contains nine tables; it was not modified. No Neon database/schema/data was created or changed.

The supplied role is not a superuser but has CREATEDB, CREATEROLE and BYPASSRLS, plus schema creation rights. Use it only for reviewed administration/migrations, not as the Worker runtime role. A separate least-privilege runtime role and schema migration require explicit approval. Credentials remain available from the upload; do not ask the user to paste them again. Runtime DATABASE_URL has not yet been provisioned.

## Provision securely

From the Neon Console, use Connect -> PostgreSQL to obtain a connection string with `sslmode=require`. Store it as `DATABASE_URL` in Worker secrets and a secure operator environment; never paste it into chat or tracked files. Use a migration owner only for reviewed migrations and a least-privilege runtime identity for the Worker.

The Worker uses `@neondatabase/serverless` over HTTP with a fresh ten-second timeout for each parameterized query. Operator migration tooling uses the same driver over a request-scoped WebSocket connection for transactional locks and multi-statement DDL. No local PostgreSQL server is required.

## Repeatable procedure

1. Inspect `database/migrations/001_initial.sql` and confirm the exact Neon project/branch/database. Obtain explicit approval for applying those changes to that target.
2. In the operator environment with securely configured `DATABASE_URL`, run `npm run db:check`. It executes a read-only transaction and returns connectivity plus applied migration names, no DSN/password/provider exception text.
3. After approval, run `npm run db:migrate -- --apply`. Without `--apply` the command refuses to write. No migrations run automatically on startup or deploy.
4. The runner opens a transaction, takes a PostgreSQL advisory lock, creates `schema_migrations`, checks file SHA-256 checksums, applies new migrations and records versions before commit. Any failure rolls back the transaction. Changed applied checksums are rejected.
5. Re-run the check, inspect foreign keys/indexes, then test `/ready` with full OAuth/MCP configuration. Readiness is not production acceptance.

## Data model

All required models use UUID primary keys and timestamptz: `users`, `oauth_connections`, `oauth_states`, `projects`, `project_permissions`, `pending_operations`, `approval_records`, `audit_events`, `security_events`, `connector_settings`. Additional `rate_limits` persists authenticated request counters; `schema_migrations` tracks versions/checksums.

Composite foreign keys bind projects/permissions/operations/approvals to the same user and connection. App queries filter by user; no RLS is claimed. OAuth token ciphertext is contextual AES-GCM; the secret encryption key is not in PostgreSQL. Operation and approval bindings are immutable. Audit/security row updates/deletes are rejected by triggers.

Provisioning users and project grants is an administrator task through reviewed SQL, not an open API or automatic OAuth grant. `project_permissions.permission` currently permits only `read`; do not add write grants until independently authenticated approval is implemented. Runtime identity should not have DDL, trigger-disable, user/provisioning or unrestricted grant-management privileges.

## Recovery and maintenance

No destructive down migration is provided. For failed uncommitted migrations rely on rollback; for applied schema defects use a reviewed forward migration. Back up before approved production changes and rehearse recovery on a Neon branch. Never edit an applied migration. Retention/expired-state/rate-counter cleanup and restore/key-rotation exercises remain operator tasks and unverified release requirements. Append-only event retention requires a separately reviewed administration process.

Local tests execute the schema in PGlite (embedded PostgreSQL) and verify constraints, rollback, SQL approval races and audit writes. Separate live read-only diagnostics now verify Neon connectivity, schema inventory and role capabilities. Production migration, connector-table permissions for a restricted runtime role, distributed contention and disaster recovery remain unverified.

Reference: https://neon.com/docs/serverless/serverless-driver
