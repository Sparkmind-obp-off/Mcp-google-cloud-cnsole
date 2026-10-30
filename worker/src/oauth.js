import { createRemoteJWKSet, jwtVerify } from 'jose';
import { decrypt, encrypt, fail, random, sha256 } from './security.js';

export const READ_SCOPE = 'https://www.googleapis.com/auth/cloud-platform.read-only';
// Google's Budgets API does not accept cloud-platform.read-only. Explicit opt-in is required.
export const BILLING_SCOPE = 'https://www.googleapis.com/auth/cloud-billing';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE = '__Host-gcp_oauth';
const cookieHeader = value => `${COOKIE}=${value}; Path=/; Max-Age=${value ? 600 : 0}; Secure; HttpOnly; SameSite=Lax`;
const tokenContext = (userId, id) => `google-tokens:${userId}:${id}`;
async function tokenRequest(env, data, fetcher = fetch) {
  const response = await fetcher(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...data, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }),
    signal: AbortSignal.timeout(15000), redirect: 'error'
  });
  if (!response.ok) fail('GOOGLE_TOKEN_EXCHANGE_FAILED', 502);
  const token = await response.json();
  if (!token.access_token || typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) fail('GOOGLE_TOKEN_INVALID', 502);
  return token;
}
export async function beginOAuth(user, env, store) {
  const state = random(), browser = random(), verifier = random(), nonce = random();
  const stateHash = await sha256(state);
  await store.beginOAuth(user.id, stateHash, await sha256(browser), await encrypt(verifier, env.TOKEN_ENCRYPTION_KEY, `oauth-state:${stateHash}`), nonce);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: 'code',
    scope: `openid email ${READ_SCOPE}${env.ENABLE_BUDGET_READ === 'true' ? ` ${BILLING_SCOPE}` : ''}`, access_type: 'offline', prompt: 'consent',
    state, nonce, code_challenge: await sha256(verifier), code_challenge_method: 'S256'
  }).toString();
  return { authorizationUrl: url.toString(), cookie: cookieHeader(browser) };
}
export async function callback(request, env, store, dependencies = {}) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const browser = request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browser || !/^[A-Za-z0-9_-]{43}$/.test(browser)) fail('INVALID_OAUTH_STATE', 400);
  const stateHash = await sha256(state);
  const row = await store.consumeOAuth(stateHash, await sha256(browser));
  // Only persisted, one-time states may allocate a rate-limit row. Random cookies cannot grow the table.
  await store.rate(row.user_id, 'oauth-callback', 10);
  if (url.searchParams.has('error')) {
    await store.security(row.user_id, 'OAUTH_DENIED');
    fail('OAUTH_DENIED', 400);
  }
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) fail('INVALID_OAUTH_CODE', 400);
  const verifier = await decrypt(row.encrypted_verifier, env.TOKEN_ENCRYPTION_KEY, `oauth-state:${stateHash}`);
  const token = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: env.GOOGLE_REDIRECT_URI, code_verifier: verifier }, dependencies.fetcher);
  if (!token.id_token || !token.refresh_token) fail('GOOGLE_OFFLINE_CONSENT_REQUIRED', 400);
  let identity;
  try {
    const verify = dependencies.verifyIdentity || (jwt => jwtVerify(jwt, createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')), {
      issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID,
      algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce']
    }));
    identity = (await verify(token.id_token)).payload;
    if (identity.nonce !== row.nonce || typeof identity.sub !== 'string' || !identity.sub || identity.email_verified !== true || (identity.azp && identity.azp !== env.GOOGLE_CLIENT_ID)) throw Error();
  } catch { fail('GOOGLE_IDENTITY_INVALID', 400); }
  const scopes = (token.scope || '').split(' ');
  if (!scopes.includes(READ_SCOPE)) fail('GOOGLE_SCOPE_MISSING', 403);
  const existing = await store.existingConnection(row.user_id, identity.sub);
  const id = existing?.id || crypto.randomUUID();
  const cipher = await encrypt(JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token }), env.TOKEN_ENCRYPTION_KEY, tokenContext(row.user_id, id));
  await store.saveConnection(row.user_id, identity.sub, id, cipher, scopes, new Date(Date.now() + token.expires_in * 1000).toISOString());
  return new Response('Google account connected. Return to your MCP client. No Google Cloud resources were modified.', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookieHeader(''), 'referrer-policy': 'no-referrer' }
  });
}
export async function accessToken(user, connectionId, env, store, fetcher = fetch) {
  const row = await store.connection(user.id, connectionId);
  if (!row.scopes.includes(READ_SCOPE)) fail('GOOGLE_SCOPE_MISSING', 403);
  const context = tokenContext(user.id, row.id);
  const tokens = JSON.parse(await decrypt(row.encrypted_tokens, env.TOKEN_ENCRYPTION_KEY, context));
  if (new Date(row.token_expires_at).getTime() > Date.now() + 60000) return tokens.access_token;
  const fresh = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, fetcher);
  const scopes = fresh.scope ? fresh.scope.split(' ') : row.scopes;
  if (!scopes.includes(READ_SCOPE)) fail('GOOGLE_SCOPE_MISSING', 403);
  const cipher = await encrypt(JSON.stringify({ access_token: fresh.access_token, refresh_token: fresh.refresh_token || tokens.refresh_token }), env.TOKEN_ENCRYPTION_KEY, context);
  await store.refresh(user.id, row.id, cipher, scopes, new Date(Date.now() + fresh.expires_in * 1000).toISOString(), row.encrypted_tokens);
  return fresh.access_token;
}
export async function disconnect(user, connectionId, env, store, fetcher = fetch) {
  const row = await store.connection(user.id, connectionId);
  const tokens = JSON.parse(await decrypt(row.encrypted_tokens, env.TOKEN_ENCRYPTION_KEY, tokenContext(user.id, row.id)));
  const response = await fetcher('https://oauth2.googleapis.com/revoke', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: tokens.refresh_token }),
    signal: AbortSignal.timeout(15000), redirect: 'error'
  });
  // Fail closed: retain encrypted token for explicit retry if provider revocation fails.
  if (!response.ok) fail('GOOGLE_REVOCATION_FAILED', 502);
  await store.revoke(user.id, connectionId);
  return { disconnected: true };
}
