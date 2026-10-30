import { z } from 'zod';
import { Store } from './database.js';
import { ConnectorError, authenticate, configuration, fail, readJson } from './security.js';
import { beginOAuth, callback, disconnect } from './oauth.js';
import { handleMcp } from './mcp.js';
import { handleModernMcp, isModernRequest, MODERN_VERSION, SUPPORTED_VERSIONS } from './mcp-modern.js';
import { dashboardHtml, dashboardScript } from './dashboard.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...headers } });
function protect(response, request, env) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', response.headers.get('content-type')?.startsWith('text/html')
    ? "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
    : "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(self)');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('cache-control', 'no-store');
  headers.set('strict-transport-security', 'max-age=31536000');
  if (request.headers.get('origin') === env.APP_ORIGIN) {
    headers.set('access-control-allow-origin', env.APP_ORIGIN);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name');
    headers.set('access-control-expose-headers', 'WWW-Authenticate');
  }
  return new Response(response.body, { status: response.status, headers });
}
export function createWorker(dependencies = {}) {
  return {
    async fetch(request, env) {
      let response;
      try { response = await route(request, env, dependencies); }
      catch (error) {
        const code = error instanceof ConnectorError ? error.code : error instanceof z.ZodError ? 'INVALID_ARGUMENTS' : 'INTERNAL_ERROR';
        const status = error instanceof ConnectorError ? error.status : error instanceof z.ZodError ? 400 : 500;
        const headers = {};
        if (status === 401) {
          // Config is server-controlled; do not reflect the untrusted Host header.
          headers['www-authenticate'] = env.APP_ORIGIN
            ? `Bearer resource_metadata="${env.APP_ORIGIN}/.well-known/oauth-protected-resource", scope="mcp:read"`
            : 'Bearer';
        }
        if (status === 429) headers['retry-after'] = '60';
        response = json({ error: { code } }, status, headers);
      }
      return protect(response, request, env);
    }
  };
}
async function route(request, env, deps) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/') return new Response(dashboardHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (request.method === 'GET' && url.pathname === '/ui/app.js') return new Response(dashboardScript, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  if (request.method === 'GET' && url.pathname === '/api/status') return json({
    environment: env.ENVIRONMENT === 'production' ? 'production-config' : 'development',
    productionReady: false, writesEnabled: false,
    databaseConfigured: Boolean(env.DATABASE_URL), readConfigurationPresent: configuration(env).ok,
    googleOAuthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI),
    mcpAuthConfigured: Boolean(env.MCP_AUTH_ISSUER && env.MCP_AUTH_AUDIENCE && env.MCP_AUTH_JWKS_URL),
    supportedProtocolVersions: SUPPORTED_VERSIONS, budgetReadOptIn: env.ENABLE_BUDGET_READ === 'true',
    voice: { mode: 'browser-optional', automaticExecution: false }, humanApprovalExecutor: 'disabled'
  });
  if (url.pathname === '/health' && request.method === 'GET') return json({
    ok: true, service: 'google-cloud-connector', stage: 'development-read-only', productionReady: false,
    writesEnabled: false, voiceImplemented: true, voiceMode: 'browser-optional'
  });
  const config = configuration(env);
  if (url.pathname === '/ready' && request.method === 'GET') {
    if (!config.ok) return json({ ready: false, code: 'CONFIGURATION_REQUIRED' }, 503);
    try { await (deps.store || new Store(env.DATABASE_URL)).ready(); }
    catch { return json({ ready: false, code: 'DATABASE_NOT_READY' }, 503); }
    return json({ ready: true, productionReady: false, writesEnabled: false });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== env.APP_ORIGIN) fail('ORIGIN_NOT_ALLOWED', 403);
  if (env.APP_ORIGIN && url.origin !== env.APP_ORIGIN && env.ENVIRONMENT !== 'development') fail('HOST_NOT_ALLOWED', 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!['/mcp', '/oauth/google/start', '/oauth/google/callback', '/connections/disconnect', '/.well-known/oauth-protected-resource'].includes(url.pathname)) fail('NOT_FOUND', 404);
  if (url.pathname === '/.well-known/oauth-protected-resource' && request.method === 'GET') {
    if (!env.APP_ORIGIN || !env.MCP_AUTH_ISSUER) fail('AUTH_NOT_CONFIGURED', 503);
    return json({ resource: `${env.APP_ORIGIN}/mcp`, authorization_servers: [env.MCP_AUTH_ISSUER], scopes_supported: ['mcp:read'], bearer_methods_supported: ['header'] });
  }
  if (!config.ok) fail('CONFIGURATION_REQUIRED', 503);
  const store = deps.store || new Store(env.DATABASE_URL);
  if (url.pathname === '/oauth/google/callback' && request.method === 'GET') return callback(request, env, store, deps.oauth);
  const user = await authenticate(request, env, (issuer, subject) => store.user(issuer, subject), deps.verifyMcpToken);
  await store.rate(user.id);
  if (url.pathname === '/oauth/google/start' && request.method === 'POST') {
    // JSON-only POST plus exact same-origin check prevents browser CSRF. Bearer token never goes in URL.
    if (origin !== env.APP_ORIGIN) fail('ORIGIN_REQUIRED', 403);
    z.strictObject({}).parse(await readJson(request));
    await store.rate(user.id, 'oauth-start', 5);
    const started = await beginOAuth(user, env, store);
    return json({ authorizationUrl: started.authorizationUrl }, 200, { 'set-cookie': started.cookie });
  }
  if (url.pathname === '/connections/disconnect' && request.method === 'POST') {
    if (origin !== env.APP_ORIGIN) fail('ORIGIN_REQUIRED', 403);
    const body = z.strictObject({ connectionId: z.uuid(), confirm: z.literal('disconnect') }).parse(await readJson(request));
    return json(await disconnect(user, body.connectionId, env, store));
  }
  if (url.pathname === '/mcp') {
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { allow: 'POST' });
    let body;
    try { body = await readJson(request); }
    catch (error) {
      if (request.headers.get('mcp-protocol-version') === MODERN_VERSION && error instanceof ConnectorError && error.code === 'INVALID_JSON') {
        return json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }, 400);
      }
      throw error;
    }
    if (isModernRequest(request, body)) return handleModernMcp(request, body, user, env, store);
    if (Array.isArray(body) || !body || typeof body !== 'object') fail('INVALID_MCP_MESSAGE', 400);
    // Legacy initialization-era clients continue through the official SDK.
    const version = request.headers.get('mcp-protocol-version');
    if (version && !['2025-11-25', '2025-06-18', '2025-03-26'].includes(version)) fail('UNSUPPORTED_MCP_PROTOCOL', 400);
    if (body.method === 'initialize' && !['2025-11-25', '2025-06-18', '2025-03-26'].includes(body.params?.protocolVersion)) fail('UNSUPPORTED_MCP_PROTOCOL', 400);
    return handleMcp(request, body, user, env, store);
  }
  fail('METHOD_NOT_ALLOWED', 405);
}
export default createWorker();
