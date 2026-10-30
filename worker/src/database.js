import { neon } from '@neondatabase/serverless';
import { fail, sha256 } from './security.js';

export class Store {
  constructor(url, query) {
    this.sql = query || neon(url);
  }
  query(text, params = []) { return this.sql.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(10000) } }); }
  async user(issuer, subject) {
    return (await this.query('SELECT id, disabled_at FROM users WHERE auth_issuer=$1 AND auth_subject=$2', [issuer, subject]))[0];
  }
  async ready() {
    const rows = await this.query("SELECT version, checksum FROM schema_migrations ORDER BY version");
    if (!rows.some(row => row.version === '001_initial.sql')) fail('MIGRATIONS_REQUIRED', 503);
    return true;
  }
  async rate(userId, lane = 'api', limit = 60) {
    const bucket = await sha256(`${userId}:${lane}`);
    const [row] = await this.query(`INSERT INTO rate_limits(bucket_hash, window_start, request_count)
      VALUES($1, date_trunc('minute', now()), 1)
      ON CONFLICT(bucket_hash) DO UPDATE SET
        request_count=CASE WHEN rate_limits.window_start < date_trunc('minute', now()) THEN 1 ELSE rate_limits.request_count+1 END,
        window_start=date_trunc('minute', now()) RETURNING request_count`, [bucket]);
    if (row.request_count > limit) fail('RATE_LIMITED', 429);
  }
  async security(userId, code) {
    await this.query('INSERT INTO security_events(user_id,event_type) VALUES($1,$2)', [userId || null, code]);
  }
  async beginOAuth(userId, stateHash, browserHash, encryptedVerifier, nonce) {
    await this.query(`INSERT INTO oauth_states(user_id,state_hash,browser_hash,encrypted_verifier,nonce,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')`, [userId, stateHash, browserHash, encryptedVerifier, nonce]);
  }
  async consumeOAuth(stateHash, browserHash) {
    // Atomic delete-and-return; two simultaneous callbacks cannot consume the same state.
    const [state] = await this.query(`DELETE FROM oauth_states s USING users u WHERE s.user_id=u.id
      AND u.disabled_at IS NULL AND s.state_hash=$1 AND s.browser_hash=$2 AND s.expires_at>now() RETURNING s.*`, [stateHash, browserHash]);
    if (!state) fail('INVALID_OAUTH_STATE', 400);
    return state;
  }
  async saveConnection(userId, subject, connectionId, cipher, scopes, expires) {
    // Caller reuses existing ID so AES-GCM context stays bound to the persisted identity.
    const [row] = await this.query(`INSERT INTO oauth_connections(id,user_id,google_subject,encrypted_tokens,scopes,token_expires_at)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(user_id,google_subject) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,
      scopes=EXCLUDED.scopes,token_expires_at=EXCLUDED.token_expires_at,updated_at=now(),revoked_at=NULL
      WHERE oauth_connections.id=EXCLUDED.id RETURNING id`, [connectionId, userId, subject, cipher, scopes, expires]);
    if (!row) fail('CONNECTION_CONFLICT_REAUTHORIZE', 409);
    await this.audit(userId, row.id, 'google.connected', 'succeeded');
    return row;
  }
  async existingConnection(userId, subject) {
    return (await this.query('SELECT id FROM oauth_connections WHERE user_id=$1 AND google_subject=$2', [userId, subject]))[0];
  }
  async connection(userId, id) {
    const [row] = await this.query('SELECT * FROM oauth_connections WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL', [userId, id]);
    if (!row) fail('CONNECTION_NOT_FOUND', 404);
    return row;
  }
  connections(userId) {
    return this.query('SELECT id,google_subject,scopes,token_expires_at,revoked_at FROM oauth_connections WHERE user_id=$1 ORDER BY created_at', [userId]);
  }
  async refresh(userId, id, cipher, scopes, expires, previousCipher) {
    const rows = await this.query(`UPDATE oauth_connections SET encrypted_tokens=$3,scopes=$4,token_expires_at=$5,updated_at=now()
      WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL AND encrypted_tokens=$6 RETURNING id`, [userId, id, cipher, scopes, expires, previousCipher]);
    if (!rows.length) fail('CONNECTION_CHANGED_RETRY', 409);
  }
  async revoke(userId, id) {
    await this.query(`UPDATE oauth_connections SET encrypted_tokens='v1.revoked', scopes='{}',revoked_at=now(),updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id]);
    await this.audit(userId, id, 'google.disconnected', 'succeeded');
  }
  projects(userId, connectionId) {
    return this.query(`SELECT p.id,p.google_project_id FROM projects p JOIN project_permissions pp ON pp.project_id=p.id
      AND pp.user_id=p.user_id AND pp.connection_id=p.connection_id WHERE p.user_id=$1 AND p.connection_id=$2 AND pp.permission='read'`, [userId, connectionId]);
  }
  async project(userId, connectionId, projectId) {
    const [row] = await this.query(`SELECT p.id FROM projects p JOIN project_permissions pp ON pp.project_id=p.id AND pp.user_id=p.user_id
      AND pp.connection_id=p.connection_id WHERE p.user_id=$1 AND p.connection_id=$2 AND p.google_project_id=$3 AND pp.permission='read'`, [userId, connectionId, projectId]);
    if (!row) fail('PROJECT_NOT_AUTHORIZED', 403);
    return row;
  }
  async audit(userId, connectionId, action, outcome) {
    await this.query('INSERT INTO audit_events(user_id,connection_id,action,outcome) VALUES($1,$2,$3,$4)', [userId, connectionId, action, outcome]);
  }
}
