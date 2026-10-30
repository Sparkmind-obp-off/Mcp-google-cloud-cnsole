import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { authenticate, b64url, canonical, configuration, decrypt, encrypt, payloadHash, random, readJson, sha256 } from '../worker/src/security.js';
import { operationBinding, validateApproval } from '../worker/src/approvals.js';
import { googleRequest, readTools, sanitize } from '../worker/src/tools.js';

const secret = random();
const connectionId = '28f2c27d-8ba0-4d3d-8e53-6ab960a67c61';
const operation = { connectionId, projectId: 'sample-project', operation: 'compute.stop', zone: 'us-central1-a', instance: 'sample-vm' };
const state = { id: '123', status: 'RUNNING', fingerprint: 'state1' };
const validEnv = {
  DATABASE_URL: 'postgresql://user:password@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=require',
  APP_ORIGIN: 'https://connector.test', GOOGLE_CLIENT_ID: 'google-test-client', GOOGLE_CLIENT_SECRET: 'test-only',
  GOOGLE_REDIRECT_URI: 'https://connector.test/oauth/google/callback', TOKEN_ENCRYPTION_KEY: secret,
  MCP_AUTH_ISSUER: 'https://issuer.test', MCP_AUTH_AUDIENCE: 'https://connector.test/mcp', MCP_AUTH_JWKS_URL: 'https://issuer.test/jwks'
};
export { validEnv };

test('PKCE matches RFC 7636 S256 test vector', async () => {
  assert.equal(await sha256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('AES-GCM encrypts tokens; wrong user, wrong key and tampering fail', async () => {
  const value = await encrypt('refresh-token-test', secret, 'user1:connection1');
  assert.ok(!value.includes('refresh-token-test'));
  assert.equal(await decrypt(value, secret, 'user1:connection1'), 'refresh-token-test');
  await assert.rejects(decrypt(value, secret, 'user2:connection1'), /TOKEN_DECRYPTION_FAILED/);
  await assert.rejects(decrypt(value, random(), 'user1:connection1'), /TOKEN_DECRYPTION_FAILED/);
  const parts = value.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await assert.rejects(decrypt(parts.join('.'), secret, 'user1:connection1'), /TOKEN_DECRYPTION_FAILED/);
  await assert.rejects(encrypt('value', b64url(new Uint8Array(16)), 'ctx'), /INVALID_ENCRYPTION_KEY/);
});
test('canonical payload hashing ignores key order but detects changes', async () => {
  assert.equal(await payloadHash({ b: 1, a: ['x'] }), await payloadHash({ a: ['x'], b: 1 }));
  assert.notEqual(await payloadHash({ a: 1 }), await payloadHash({ a: 2 }));
  assert.throws(() => canonical({ bad: undefined }), /INVALID_PAYLOAD/);
});
test('configuration rejects S3 URLs, missing config, insecure origins and bad key', () => {
  assert.equal(configuration(validEnv).ok, true);
  assert.equal(configuration({}).ok, false);
  assert.ok(configuration({ ...validEnv, DATABASE_URL: 'https://storage.neon.tech' }).invalid.includes('DATABASE_URL'));
  assert.ok(configuration({ ...validEnv, APP_ORIGIN: 'http://connector.test' }).invalid.includes('APP_ORIGIN'));
  assert.ok(configuration({ ...validEnv, GOOGLE_REDIRECT_URI: 'https://evil.test/callback' }).invalid.includes('GOOGLE_REDIRECT_URI'));
  assert.ok(configuration({ ...validEnv, TOKEN_ENCRYPTION_KEY: 'bad' }).invalid.includes('TOKEN_ENCRYPTION_KEY'));
});
test('input schemas block proxy URLs, unknown fields, unbounded pages and path traversal', () => {
  const tool = readTools.find(t => t.name === 'gcp_get_compute_instance');
  assert.equal(tool.schema.safeParse({ connectionId, projectId: 'sample-project', zone: 'us-central1-a', instance: 'ok-vm' }).success, true);
  for (const bad of [
    { instance: '../other' }, { zone: 'https://evil.test' }, { url: 'https://evil.test' }, { projectId: 'other/project' }
  ]) assert.equal(tool.schema.safeParse({ connectionId, projectId: 'sample-project', zone: 'us-central1-a', instance: 'ok-vm', ...bad }).success, false);
  assert.equal(readTools.find(t => t.name === 'gcp_list_compute_instances').schema.safeParse({ connectionId, projectId: 'sample-project', zone: 'us-central1-a', pageSize: 10000 }).success, false);
});
test('approval is bound to tenant, connection, project, exact payload, state and expiry', async () => {
  const binding = await operationBinding(operation, state);
  const record = { user_id: 'user1', connection_id: connectionId, project_id: 'project-row', status: 'approved', payload_hash: binding.payloadHash, resource_state_hash: binding.resourceStateHash, expires_at: new Date(Date.now()+60000).toISOString(), consumed_at: null };
  const identity = { userId: 'user1', connectionId, projectId: 'project-row' };
  assert.equal(await validateApproval(record, identity, operation, state), true);
  await assert.rejects(validateApproval(record, { ...identity, userId: 'user2' }, operation, state), /IDENTITY_MISMATCH/);
  await assert.rejects(validateApproval(record, { ...identity, connectionId: crypto.randomUUID() }, operation, state), /IDENTITY_MISMATCH/);
  await assert.rejects(validateApproval(record, { ...identity, projectId: 'other' }, operation, state), /IDENTITY_MISMATCH/);
  await assert.rejects(validateApproval({ ...record, consumed_at: new Date() }, identity, operation, state), /NOT_USABLE/);
  await assert.rejects(validateApproval({ ...record, expires_at: '2000-01-01T00:00:00Z' }, identity, operation, state), /EXPIRED/);
  await assert.rejects(validateApproval(record, identity, { ...operation, instance: 'other-vm' }, state), /PAYLOAD_CHANGED/);
  await assert.rejects(validateApproval(record, identity, operation, { ...state, status: 'STOPPED' }), /RESOURCE_CHANGED/);
});
test('OAuth scopes are distinct from MCP identity and JWT issuer/audience/expiration', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const issue = (aud = validEnv.MCP_AUTH_AUDIENCE, expiration = '5m', issuer = validEnv.MCP_AUTH_ISSUER, scope = 'mcp:read') => new SignJWT({ scope }).setProtectedHeader({ alg: 'ES256' }).setIssuer(issuer).setAudience(aud).setSubject('registered-sub').setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  const verifier = token => jwtVerify(token, publicKey, { issuer: validEnv.MCP_AUTH_ISSUER, audience: validEnv.MCP_AUTH_AUDIENCE, algorithms: ['ES256'], requiredClaims: ['sub','iat','exp'], maxTokenAge: '1h' });
  const request = token => new Request('https://connector.test/mcp', { headers: { authorization: `Bearer ${token}` } });
  const lookup = async (issuer, subject) => issuer === validEnv.MCP_AUTH_ISSUER && subject === 'registered-sub' ? { id: 'user1' } : null;
  assert.equal((await authenticate(request(await issue()), validEnv, lookup, verifier)).id, 'user1');
  for (const token of [await issue('google-oauth'), await issue(undefined, '0s'), await issue(undefined, '5m', 'https://evil.test')]) await assert.rejects(authenticate(request(token), validEnv, lookup, verifier), /UNAUTHENTICATED/);
  await assert.rejects(authenticate(request(await issue(undefined, '5m', undefined, 'cloud-platform.read-only')), validEnv, lookup, verifier), /INSUFFICIENT_SCOPE/);
  await assert.rejects(authenticate(request(await issue()), validEnv, async () => null, verifier), /USER_NOT_REGISTERED/);
  await assert.rejects(authenticate(new Request('https://connector.test/mcp'), validEnv, lookup, verifier), /UNAUTHENTICATED/);
});
test('bounded JSON parser rejects oversized streamed body and malformed JSON', async () => {
  const request = text => new Request('https://connector.test/mcp', { method: 'POST', headers: { 'content-type':'application/json' }, body: text });
  await assert.rejects(readJson(request('x'.repeat(100)), 32), /PAYLOAD_TOO_LARGE/);
  await assert.rejects(readJson(request('{')), /INVALID_JSON/);
  assert.deepEqual(await readJson(request('{"ok":true}')), { ok: true });
});
test('Google errors distinguish IAM, scope and API enablement without token leakage', async () => {
  for (const [status, reason, expected] of [[403,'SERVICE_DISABLED','GOOGLE_API_NOT_ENABLED'],[403,'ACCESS_TOKEN_SCOPE_INSUFFICIENT','GOOGLE_SCOPE_MISSING'],[403,'OTHER','GOOGLE_IAM_PERMISSION_DENIED'],[401,'OTHER','GOOGLE_REAUTHORIZE_REQUIRED'],[429,'OTHER','GOOGLE_RATE_LIMITED']]) {
    const fetcher = async () => Response.json({ error: { message: 'sensitive-test-token', details: [{ '@type':'type.googleapis.com/google.rpc.ErrorInfo', reason }] } }, { status });
    await assert.rejects(googleRequest('compute.googleapis.com','/compute/v1/projects/sample-project','sensitive-test-token',{},fetcher), error => error.message === expected);
  }
  await assert.rejects(googleRequest('evil.test','/path','token'), /API_NOT_ALLOWED/);
});
test('output sanitization removes common secret-bearing fields and raw log payloads', () => {
  const value = sanitize({ name: 'vm', metadata: { items: [{ value: 'secret-value' }] }, env: [{ name: 'PASSWORD', value: 'pw' }], accessToken: 'token', jsonPayload: { authorization: 'secret' } });
  assert.equal(value.name, 'vm');
  assert.equal(sanitize({ nextPageToken: 'opaque-pagination-cursor' }).nextPageToken, 'opaque-pagination-cursor');
  for (const forbidden of ['secret-value','"pw"','"token"','authorization']) assert.ok(!JSON.stringify(value).includes(forbidden));
});
