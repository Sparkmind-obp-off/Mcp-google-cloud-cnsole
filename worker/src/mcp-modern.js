import { z } from 'zod';
import { createToolRegistry, SERVER_INFO } from './mcp.js';

export const MODERN_VERSION = '2026-07-28';
export const SUPPORTED_VERSIONS = [MODERN_VERSION, '2025-11-25', '2025-06-18', '2025-03-26'];
const PREFIX = 'io.modelcontextprotocol/';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = id => (typeof id === 'string' && id.length <= 128) || (Number.isSafeInteger(id));
export function isModernRequest(request, body) {
  return request.headers.get('mcp-protocol-version') === MODERN_VERSION || object(body?.params?._meta) && Object.hasOwn(body.params._meta, `${PREFIX}protocolVersion`);
}
function decodeHeader(value) {
  if (!value || !/^[\x20-\x7e]+$/.test(value)) throw Error();
  if (value.startsWith('=?base64?') && value.endsWith('?=')) {
    const encoded = value.slice(9, -2);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
  }
  if (value.trim() !== value) throw Error();
  return value;
}
export async function handleModernMcp(request, body, user, env, store) {
  const id = validId(body?.id) ? body.id : undefined;
  const error = (code, message, status = 400, data) => Response.json({ jsonrpc: '2.0', ...(id !== undefined ? { id } : {}), error: { code, message, ...(data ? { data } : {}) } }, { status, headers: { 'cache-control': 'no-store' } });
  if (!object(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string' || !/^[A-Za-z][A-Za-z0-9_./-]{0,127}$/.test(body.method) || ('id' in body && !validId(body.id)) || 'result' in body || 'error' in body) return error(-32600, 'Invalid Request');
  const meta = body.params?._meta;
  if (!object(meta) || typeof meta[`${PREFIX}protocolVersion`] !== 'string' || !object(meta[`${PREFIX}clientCapabilities`])) return error(-32602, 'Required per-request metadata is missing or malformed');
  const clientInfo = meta[`${PREFIX}clientInfo`];
  if (clientInfo !== undefined && (!object(clientInfo) || typeof clientInfo.name !== 'string' || typeof clientInfo.version !== 'string')) return error(-32602, 'Invalid clientInfo');
  const version = meta[`${PREFIX}protocolVersion`];
  if (request.headers.get('mcp-protocol-version') !== version || request.headers.get('mcp-method') !== body.method) return error(-32020, 'HeaderMismatch');
  if (body.method === 'tools/call' || body.method === 'prompts/get' || body.method === 'resources/read') {
    try {
      const expected = body.params?.name ?? body.params?.uri;
      if (typeof expected !== 'string' || decodeHeader(request.headers.get('mcp-name')) !== expected) return error(-32020, 'HeaderMismatch');
    } catch { return error(-32020, 'HeaderMismatch'); }
  }
  if (version !== MODERN_VERSION) return error(-32022, 'UnsupportedProtocolVersion', 400, { requested: version, supported: SUPPORTED_VERSIONS });
  const accept = (request.headers.get('accept') || '').split(',').map(part => part.trim().toLowerCase()).filter(part => !/;\s*q=0(?:\.0*)?(?:;|$)/.test(part)).map(part => part.split(';')[0]);
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return error(-32600, 'Accept must include application/json and text/event-stream', 406);
  if (id === undefined) return new Response(null, { status: 202 });
  const result = value => Response.json({ jsonrpc: '2.0', id, result: { resultType: 'complete', ...value, _meta: { [`${PREFIX}serverInfo`]: SERVER_INFO } } }, { headers: { 'cache-control': 'no-store' } });
  const registry = createToolRegistry(user, env, store);
  try {
    if (body.method === 'server/discover') {
      z.strictObject({ _meta: z.record(z.string(), z.unknown()) }).parse(body.params);
      return result({ supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: { listChanged: false } }, cacheScope: 'private', ttlMs: 0,
        instructions: 'Read-only Google Cloud connector. Project grants and Google IAM are independent. No write or approval tools are enabled.' });
    }
    if (body.method === 'ping') return result({});
    if (body.method === 'tools/list') {
      z.strictObject({ _meta: z.record(z.string(), z.unknown()), cursor: z.undefined().optional() }).parse(body.params);
      return result({ tools: [...registry.values()].map(tool => ({ name: tool.name, description: tool.description, inputSchema: z.toJSONSchema(tool.schema, { target: 'draft-2020-12' }), annotations: tool.annotations })), cacheScope: 'private', ttlMs: 0 });
    }
    if (body.method === 'tools/call') {
      const args = z.strictObject({ _meta: z.record(z.string(), z.unknown()), name: z.string().max(128), arguments: z.record(z.string(), z.unknown()).optional() }).parse(body.params);
      const tool = registry.get(args.name);
      if (!tool) return error(-32602, 'Unknown tool');
      return result(await tool.invoke(args.arguments || {}));
    }
    return error(-32601, 'Method not found', 404);
  } catch (cause) {
    return cause instanceof z.ZodError ? error(-32602, 'Invalid params') : error(-32603, 'Internal error', 500);
  }
}
