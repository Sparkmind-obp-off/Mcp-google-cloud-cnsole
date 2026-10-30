// Operator-only Node.js utility; never bundled into the Worker.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';

const mode = process.argv[2];
if (!['check', 'migrate'].includes(mode)) {
  console.error('Usage: node scripts/database.js check|migrate [--apply]'); process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('BLOCKED — DATABASE_URL must be provisioned securely in the operator environment. S3 credentials are not PostgreSQL credentials.'); process.exit(2);
}
if (mode === 'migrate' && !process.argv.includes('--apply')) {
  console.error('BLOCKED — Review migrations and obtain exact database-change approval, then pass --apply.'); process.exit(2);
}
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
let client;
try {
  client = await pool.connect();
  if (mode === 'check') {
    await client.query('BEGIN READ ONLY');
    const result = await client.query('SELECT 1 AS connected');
    const tracking = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists");
    const applied = tracking.rows[0].exists ? (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version) : [];
    await client.query('COMMIT');
    console.log(JSON.stringify({ connected: result.rows[0].connected === 1, appliedMigrations: applied }));
  } else {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('gcp-connector-migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = new URL('../database/migrations/', import.meta.url);
    for (const version of (await readdir(directory)).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const source = await readFile(new URL(version, directory), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
      if (rows.length) { if (rows[0].checksum !== checksum) throw Error('MIGRATION_CHECKSUM_MISMATCH'); continue; }
      await client.query(source);
      await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [version, checksum]);
      console.log(`Applied ${version}`);
    }
    await client.query('COMMIT');
  }
} catch {
  try { await client?.query('ROLLBACK'); } catch { /* connection may be unavailable */ }
  // Neon driver errors can contain connection strings. Do not print them.
  console.error('DATABASE_OPERATION_FAILED — inspect provider logs securely; credentials and database messages withheld.');
  process.exitCode = 1;
} finally {
  client?.release(); await pool.end();
}
