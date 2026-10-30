import { createRemoteJWKSet, jwtVerify } from 'jose';

export class ConnectorError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new ConnectorError(code, status); };
export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export function unb64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail('INVALID_ENCODING', 400);
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async value => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  fail('INVALID_PAYLOAD', 400);
}
export const payloadHash = value => sha256(canonical(value));
async function key(secret) {
  const bytes = unb64(secret);
  if (bytes.length !== 32) fail('INVALID_ENCRYPTION_KEY', 503);
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(value, secret, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, await key(secret), new TextEncoder().encode(value));
  return `v1.${b64url(iv)}.${b64url(cipher)}`;
}
export async function decrypt(value, secret, context) {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') fail('INVALID_CIPHERTEXT', 503);
  try {
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]), additionalData: new TextEncoder().encode(context) }, await key(secret), unb64(parts[2]));
    return new TextDecoder().decode(clear);
  } catch { fail('TOKEN_DECRYPTION_FAILED', 503); }
}
export function configuration(env) {
  const required = ['DATABASE_URL', 'APP_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY', 'MCP_AUTH_ISSUER', 'MCP_AUTH_AUDIENCE', 'MCP_AUTH_JWKS_URL'];
  const missing = required.filter(name => !env[name]);
  const invalid = [];
  for (const name of ['APP_ORIGIN', 'GOOGLE_REDIRECT_URI', 'MCP_AUTH_ISSUER', 'MCP_AUTH_JWKS_URL']) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /REPLACE|example\./i.test(url.hostname)) invalid.push(name);
      if (name === 'APP_ORIGIN' && url.origin !== env[name]) invalid.push(name);
    } catch { invalid.push(name); }
  }
  if (env.GOOGLE_REDIRECT_URI && env.APP_ORIGIN && env.GOOGLE_REDIRECT_URI !== `${env.APP_ORIGIN}/oauth/google/callback`) invalid.push('GOOGLE_REDIRECT_URI');
  if (env.DATABASE_URL) {
    try { const u = new URL(env.DATABASE_URL); if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.username || !u.password || !u.hostname.endsWith('.neon.tech') || u.pathname.length < 2 || u.searchParams.get('sslmode') !== 'require') invalid.push('DATABASE_URL'); }
    catch { invalid.push('DATABASE_URL'); }
  }
  if (env.TOKEN_ENCRYPTION_KEY) {
    try { if (unb64(env.TOKEN_ENCRYPTION_KEY).length !== 32) invalid.push('TOKEN_ENCRYPTION_KEY'); } catch { invalid.push('TOKEN_ENCRYPTION_KEY'); }
  }
  return { ok: !missing.length && !invalid.length, missing, invalid: [...new Set(invalid)] };
}
export async function authenticate(request, env, lookup, verifier) {
  const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!token || token.length > 8192) fail('UNAUTHENTICATED', 401);
  if (!env.MCP_AUTH_ISSUER || !env.MCP_AUTH_AUDIENCE || !env.MCP_AUTH_JWKS_URL) fail('AUTH_NOT_CONFIGURED', 503);
  let claims;
  try {
    const verify = verifier || ((jwt) => jwtVerify(jwt, createRemoteJWKSet(new URL(env.MCP_AUTH_JWKS_URL)), {
      issuer: env.MCP_AUTH_ISSUER, audience: env.MCP_AUTH_AUDIENCE, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '1h'
    }));
    claims = (await verify(token)).payload;
  } catch { fail('UNAUTHENTICATED', 401); }
  if (typeof claims.sub !== 'string' || typeof claims.scope !== 'string' || !claims.scope.split(' ').includes('mcp:read')) fail('INSUFFICIENT_SCOPE', 403);
  const user = await lookup(env.MCP_AUTH_ISSUER, claims.sub);
  if (!user || user.disabled_at) fail('USER_NOT_REGISTERED', 403);
  return user;
}
export async function readJson(request, limit = 32768) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail('UNSUPPORTED_MEDIA_TYPE', 415);
  if (Number(request.headers.get('content-length')) > limit) fail('PAYLOAD_TOO_LARGE', 413);
  if (!request.body) fail('INVALID_JSON', 400);
  const reader = request.body.getReader();
  let bytes = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); fail('PAYLOAD_TOO_LARGE', 413); }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); } catch { fail('INVALID_JSON', 400); }
}
