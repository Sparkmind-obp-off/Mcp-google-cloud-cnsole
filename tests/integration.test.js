import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Store } from '../worker/src/database.js';
import { ApprovalStore, operationBinding } from '../worker/src/approvals.js';
import { createWorker } from '../worker/src/index.js';
import { beginOAuth, callback, accessToken, READ_SCOPE } from '../worker/src/oauth.js';
import { decrypt, encrypt, random, sha256 } from '../worker/src/security.js';
import { invokeRead, readTools } from '../worker/src/tools.js';

const env = {
  DATABASE_URL: 'postgresql://test:password@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=require', APP_ORIGIN: 'https://connector.test',
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-only-secret', GOOGLE_REDIRECT_URI: 'https://connector.test/oauth/google/callback',
  TOKEN_ENCRYPTION_KEY: random(), MCP_AUTH_ISSUER: 'https://issuer.test', MCP_AUTH_AUDIENCE: 'https://connector.test/mcp', MCP_AUTH_JWKS_URL: 'https://issuer.test/jwks'
};
const bodyRequest = (path, value, headers = {}) => new Request(`${env.APP_ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer test-token', ...headers }, body: JSON.stringify(value) });

test('isolated PostgreSQL integration and Worker protocol (not a live Neon/Google test)', async t => {
  const db = new PGlite();
  const store = new Store(null, { query: async (text, params) => (await db.query(text, params)).rows });
  try {
    const migration = await readFile(new URL('../database/migrations/001_initial.sql', import.meta.url), 'utf8');
    await db.exec('BEGIN');
    await db.exec('CREATE TABLE schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.exec(migration);
    await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', ['001_initial.sql',createHash('sha256').update(migration).digest('hex')]);
    await db.exec('COMMIT');
    const [user1] = await store.query("INSERT INTO users(auth_issuer,auth_subject) VALUES($1,'test-sub') RETURNING id", [env.MCP_AUTH_ISSUER]);
    const [user2] = await store.query("INSERT INTO users(auth_issuer,auth_subject) VALUES($1,'other-sub') RETURNING id", [env.MCP_AUTH_ISSUER]);
    const connectionId = crypto.randomUUID();
    const cipher = await encrypt(JSON.stringify({ access_token: 'test-access-token', refresh_token: 'test-refresh-token' }), env.TOKEN_ENCRYPTION_KEY, `google-tokens:${user1.id}:${connectionId}`);
    await store.saveConnection(user1.id,'test-google-sub',connectionId,cipher,[READ_SCOPE],new Date(Date.now()+3600000).toISOString());
    const [project] = await store.query('INSERT INTO projects(user_id,connection_id,google_project_id) VALUES($1,$2,$3) RETURNING id',[user1.id,connectionId,'sample-project']);
    await store.query("INSERT INTO project_permissions(user_id,connection_id,project_id,permission) VALUES($1,$2,$3,'read')",[user1.id,connectionId,project.id]);

    await t.test('migration creates all ten required tables, keys and indexes', async () => {
      assert.equal(await store.ready(), true);
      const tables = await store.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
      for (const name of ['users','oauth_connections','oauth_states','projects','project_permissions','pending_operations','approval_records','audit_events','security_events','connector_settings']) assert.ok(tables.some(r => r.tablename === name));
      const indexes = await store.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'");
      assert.ok(indexes.some(i => i.indexname === 'audit_events_user_time'));
    });
    await t.test('transaction rollback leaves no partial migration effects', async () => {
      await db.exec('BEGIN');
      await db.exec('CREATE TABLE rollback_probe(id uuid PRIMARY KEY)');
      await assert.rejects(db.exec('SELECT * FROM missing_migration_table'));
      await db.exec('ROLLBACK');
      const result = await store.query("SELECT to_regclass('public.rollback_probe') AS relation");
      assert.equal(result[0].relation, null);
    });
    await t.test('tenant isolation and cross-tenant foreign keys fail closed', async () => {
      assert.deepEqual(await store.connections(user2.id), []);
      await assert.rejects(store.connection(user2.id,connectionId), /CONNECTION_NOT_FOUND/);
      await assert.rejects(store.project(user2.id,connectionId,'sample-project'), /PROJECT_NOT_AUTHORIZED/);
      await assert.rejects(store.project(user1.id,connectionId,'unselected-project'), /PROJECT_NOT_AUTHORIZED/);
      await assert.rejects(store.query('INSERT INTO projects(user_id,connection_id,google_project_id) VALUES($1,$2,$3)', [user2.id,connectionId,'other-project']));
    });
    await t.test('OAuth state is browser-bound, expires and is consumed once atomically', async () => {
      await store.beginOAuth(user1.id,'test-state','browser','v1.encrypted','nonce');
      await assert.rejects(store.consumeOAuth('test-state','other-browser'), /INVALID_OAUTH_STATE/);
      assert.equal((await store.consumeOAuth('test-state','browser')).user_id, user1.id);
      await assert.rejects(store.consumeOAuth('test-state','browser'), /INVALID_OAUTH_STATE/);
      await store.beginOAuth(user1.id,'expired','browser','v1.encrypted','nonce');
      await store.query("UPDATE oauth_states SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE state_hash='expired'");
      await assert.rejects(store.consumeOAuth('expired','browser'), /INVALID_OAUTH_STATE/);
    });
    await t.test('Google callback uses PKCE, verifies nonce and stores only encrypted tokens (mock Google)', async () => {
      const started = await beginOAuth(user1,env,store);
      const auth = new URL(started.authorizationUrl);
      assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
      assert.equal(auth.searchParams.get('scope'), `openid email ${READ_SCOPE}`);
      assert.ok(started.cookie.includes('Secure; HttpOnly; SameSite=Lax'));
      const cookie = started.cookie.split(';')[0];
      let exchanged = false;
      const request = new Request(`${env.APP_ORIGIN}/oauth/google/callback?code=test-code&state=${auth.searchParams.get('state')}`, { headers: { cookie } });
      const response = await callback(request,env,store,{
        fetcher: async (url, init) => {
          assert.equal(url,'https://oauth2.googleapis.com/token');
          assert.equal(await sha256(init.body.get('code_verifier')), auth.searchParams.get('code_challenge'));
          exchanged = true;
          return Response.json({ access_token:'callback-access-test',refresh_token:'callback-refresh-test',id_token:'mock-id-token',token_type:'Bearer',expires_in:3600,scope:`openid email ${READ_SCOPE}` });
        },
        verifyIdentity: async () => ({ payload: { sub:'test-google-sub',nonce:auth.searchParams.get('nonce'),email_verified:true } })
      });
      assert.equal(response.status,200); assert.equal(exchanged,true);
      const row = await store.connection(user1.id,connectionId);
      assert.ok(!JSON.stringify(row).includes('callback-refresh-test'));
      const clear = JSON.parse(await decrypt(row.encrypted_tokens,env.TOKEN_ENCRYPTION_KEY,`google-tokens:${user1.id}:${connectionId}`));
      assert.equal(clear.refresh_token,'callback-refresh-test');
      await assert.rejects(callback(request,env,store), /INVALID_OAUTH_STATE/);
    });
    await t.test('Google callback rejects wrong identity nonce without connection persistence', async () => {
      const started = await beginOAuth(user2,env,store), auth = new URL(started.authorizationUrl);
      const request = new Request(`${env.APP_ORIGIN}/oauth/google/callback?code=test-code&state=${auth.searchParams.get('state')}`, { headers: { cookie:started.cookie.split(';')[0] } });
      await assert.rejects(callback(request,env,store,{
        fetcher: async () => Response.json({ access_token:'a',refresh_token:'r',id_token:'i',token_type:'Bearer',expires_in:3600,scope:READ_SCOPE }),
        verifyIdentity: async () => ({ payload: { sub:'other-google',nonce:'wrong',email_verified:true } })
      }), /GOOGLE_IDENTITY_INVALID/);
      assert.deepEqual(await store.connections(user2.id), []);
    });
    await t.test('token refresh preserves rotated refresh token and CAS rejects stale updates', async () => {
      await store.query("UPDATE oauth_connections SET token_expires_at=now()-interval '1 second' WHERE id=$1", [connectionId]);
      const before = await store.connection(user1.id,connectionId);
      const token = await accessToken(user1,connectionId,env,store,async (url,init) => {
        assert.equal(init.body.get('grant_type'),'refresh_token');
        return Response.json({ access_token:'new-access-test',refresh_token:'rotated-refresh-test',token_type:'Bearer',expires_in:3600,scope:READ_SCOPE });
      });
      assert.equal(token,'new-access-test');
      const after = await store.connection(user1.id,connectionId);
      const clear = JSON.parse(await decrypt(after.encrypted_tokens,env.TOKEN_ENCRYPTION_KEY,`google-tokens:${user1.id}:${connectionId}`));
      assert.equal(clear.refresh_token,'rotated-refresh-test');
      await assert.rejects(store.refresh(user1.id,connectionId,before.encrypted_tokens,[READ_SCOPE],new Date(Date.now()+3600000).toISOString(),before.encrypted_tokens), /CONNECTION_CHANGED_RETRY/);
    });
    await t.test('read invocation checks project before contacting Google and redacts output (mock Google)', async () => {
      const tool = readTools.find(t => t.name === 'gcp_get_compute_instance');
      let calls = 0;
      const fetcher = async () => { calls++; return Response.json({ name:'sample-vm',status:'RUNNING',metadata:{items:[{value:'unsafe-value'}]} }); };
      const args = { connectionId, projectId:'sample-project',zone:'us-central1-a',instance:'sample-vm' };
      await assert.rejects(invokeRead(tool,{...args,projectId:'other-project'},user1,env,store,fetcher), /PROJECT_NOT_AUTHORIZED/);
      assert.equal(calls,0);
      const value = await invokeRead(tool,args,user1,env,store,fetcher);
      assert.equal(value.status,'RUNNING'); assert.equal(value.metadata,'[REDACTED]');
    });
    await t.test('approval SQL binds payload, rejects cross-user/stale/replay, audits decision and claim', async () => {
      const approvals = new ApprovalStore(store);
      const input = { connectionId,projectId:'sample-project',operation:'compute.stop',zone:'us-central1-a',instance:'sample-vm' };
      const state = { status:'RUNNING',fingerprint:'test1' };
      const preview = await approvals.preview(user1.id,project.id,input,state);
      assert.equal(preview.executionEnabled,false);
      await assert.rejects(approvals.decide(user2.id,preview.id,preview.payloadHash,'approved'), /NOT_APPROVABLE/);
      await assert.rejects(approvals.decide(user1.id,preview.id,'different-payload','approved'), /NOT_APPROVABLE/);
      await assert.rejects(store.query("UPDATE pending_operations SET payload='{}'::jsonb WHERE id=$1",[preview.id]), /immutable/);
      await approvals.decide(user1.id,preview.id,preview.payloadHash,'approved');
      await assert.rejects(approvals.claim(user1.id,preview.id,preview.payloadHash,'wrong-resource-state'), /NOT_USABLE/);
      const claims = await Promise.allSettled([
        approvals.claim(user1.id,preview.id,preview.payloadHash,preview.resourceStateHash),
        approvals.claim(user1.id,preview.id,preview.payloadHash,preview.resourceStateHash)
      ]);
      assert.equal(claims.filter(c => c.status==='fulfilled').length,1);
      await assert.rejects(approvals.claim(user1.id,preview.id,preview.payloadHash,preview.resourceStateHash), /NOT_USABLE/);
      const audit = await store.query('SELECT action FROM audit_events WHERE operation_id=$1',[preview.id]);
      assert.ok(audit.some(e => e.action==='operation.decision'));
      assert.ok(audit.some(e => e.action==='operation.claim'));
      await assert.rejects(store.query("UPDATE audit_events SET outcome='tampered' WHERE operation_id=$1",[preview.id]), /append-only/);
      await assert.rejects(store.query('DELETE FROM audit_events WHERE operation_id=$1',[preview.id]), /append-only/);
      await assert.rejects(store.query("UPDATE approval_records SET consumed_at=NULL WHERE operation_id=$1",[preview.id]), /immutable/);
      await assert.rejects(store.query("UPDATE approval_records SET decision='rejected' WHERE operation_id=$1",[preview.id]), /immutable/);
      const binding = await operationBinding(input,state);
      const [expired] = await store.query(`INSERT INTO pending_operations(user_id,connection_id,project_id,operation_type,target,payload,payload_hash,resource_state_hash,created_at,expires_at)
        VALUES($1,$2,$3,'compute.stop',$4,$5::jsonb,$6,$7,now()-interval '2 hours',now()-interval '1 hour') RETURNING id`,
        [user1.id,connectionId,project.id,binding.target,JSON.stringify(input),binding.payloadHash,binding.resourceStateHash]);
      await assert.rejects(approvals.decide(user1.id,expired.id,binding.payloadHash,'approved'), /NOT_APPROVABLE/);
    });
    await t.test('Worker MCP initialize, tool discovery, invocation, malformed request and fail-closed writes', async () => {
      const worker = createWorker({ store, verifyMcpToken:async () => ({payload:{sub:'test-sub',scope:'mcp:read'}}) });
      const rpc = async value => worker.fetch(bodyRequest('/mcp',value),env);
      const init = await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test-client',version:'1'}}});
      assert.equal(init.status,200);
      const initialized = await init.json();
      assert.equal(initialized.result.protocolVersion,'2025-11-25');
      const tools = await (await rpc({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})).json();
      assert.ok(tools.result.tools.some(t => t.name==='gcp_get_project'));
      assert.ok(!tools.result.tools.some(t => /approve|execute|stop|start/.test(t.name)));
      const call = await (await rpc({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'gcp_get_connection_status',arguments:{}}})).json();
      assert.equal(call.result.structuredContent.data[0].id,connectionId);
      assert.ok(!JSON.stringify(call).includes('encrypted_tokens'));
      assert.ok(!JSON.stringify(call).includes('rotated-refresh-test'));
      const malformed = await rpc({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'gcp_get_compute_instance',arguments:{connectionId,projectId:'sample-project',instance:'../escape'}}});
      const failed = await malformed.json();
      assert.ok(failed.result?.isError || failed.error);
      assert.equal((await rpc({jsonrpc:'2.0',id:5,method:'initialize',params:{protocolVersion:'2026-07-28'}})).status,400);
      const unauthorized = await worker.fetch(new Request(`${env.APP_ORIGIN}/mcp`,{method:'POST'}),env);
      assert.equal(unauthorized.status,401);
      assert.ok(unauthorized.headers.get('www-authenticate').includes('oauth-protected-resource'));
      assert.equal((await worker.fetch(bodyRequest('/mcp',{}, {origin:'https://evil.test'}),env)).status,403);
      assert.equal((await worker.fetch(bodyRequest('/operations/execute',{}),env)).status,404);
      assert.equal((await worker.fetch(new Request(`${env.APP_ORIGIN}/ready`),env)).status,200);
    });
    await t.test('OAuth start requires same-origin bearer authentication and JSON; callback never accepts a bearer in URL', async () => {
      const worker = createWorker({store,verifyMcpToken:async()=>({payload:{sub:'test-sub',scope:'mcp:read'}})});
      const missingOrigin = await worker.fetch(bodyRequest('/oauth/google/start',{}),env);
      assert.equal(missingOrigin.status,403);
      const started = await worker.fetch(bodyRequest('/oauth/google/start',{}, {origin:env.APP_ORIGIN}),env);
      assert.equal(started.status,200);
      assert.ok(started.headers.get('set-cookie').includes('__Host-gcp_oauth='));
      assert.ok(new URL((await started.json()).authorizationUrl).searchParams.get('code_challenge'));
      const invalid = await worker.fetch(new Request(`${env.APP_ORIGIN}/oauth/google/callback?state=invalid&code=fake`),env);
      assert.equal(invalid.status,400);
      assert.equal((await invalid.json()).error.code,'INVALID_OAUTH_STATE');
    });
    await t.test('shared persistent rate limit rejects excess requests', async () => {
      for (let i=0;i<3;i++) await store.rate(user2.id,'test-lane',3);
      await assert.rejects(store.rate(user2.id,'test-lane',3), /RATE_LIMITED/);
      const otherStore = new Store(null,{query:async(text,params)=>(await db.query(text,params)).rows});
      await assert.rejects(otherStore.rate(user2.id,'test-lane',3), /RATE_LIMITED/);
    });
    await t.test('provider and local disconnect revoke only the owning connection (mock Google)', async () => {
      const { disconnect } = await import('../worker/src/oauth.js');
      let calls = 0;
      const fetcher = async (url,init) => { calls++; assert.equal(url,'https://oauth2.googleapis.com/revoke'); assert.ok(init.body.get('token')); return new Response(null,{status:200}); };
      await assert.rejects(disconnect(user2,connectionId,env,store,fetcher), /CONNECTION_NOT_FOUND/); assert.equal(calls,0);
      await assert.rejects(disconnect(user1,connectionId,env,store,async()=>new Response(null,{status:503})), /GOOGLE_REVOCATION_FAILED/);
      assert.equal((await store.connection(user1.id,connectionId)).revoked_at,null);
      assert.deepEqual(await disconnect(user1,connectionId,env,store,fetcher), {disconnected:true});
      await assert.rejects(store.connection(user1.id,connectionId), /CONNECTION_NOT_FOUND/);
      const [row] = await store.query('SELECT encrypted_tokens FROM oauth_connections WHERE id=$1',[connectionId]);
      assert.equal(row.encrypted_tokens,'v1.revoked');
    });
  } finally { await db.close(); }
});

test('unconfigured worker is explicit and does not pretend readiness', async () => {
  const worker = createWorker();
  const health = await worker.fetch(new Request('http://localhost:3000/health'),{});
  assert.equal(health.status,200); assert.equal((await health.json()).productionReady,false);
  assert.equal((await worker.fetch(new Request('http://localhost:3000/ready'),{})).status,503);
  assert.equal((await worker.fetch(bodyRequest('/mcp',{}),{})).status,503);
});
