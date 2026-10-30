import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { ConnectorError } from './security.js';
import { readTools, invokeRead, googleRequest, sanitize } from './tools.js';
import { accessToken } from './oauth.js';

export const SERVER_INFO = { name: 'google-cloud-console-connector', version: '0.3.0' };
export const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export function createToolRegistry(user, env, store) {
  const registry = new Map();
  function register(name, description, schema, callback) {
    registry.set(name, { name, description, schema, annotations: READ_ANNOTATIONS, invoke: async input => {
      try {
        const args = schema.parse(input);
        const value = await callback(args);
        const structuredContent = { data: value };
        return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
      } catch (error) {
        const code = error instanceof ConnectorError ? error.code : error instanceof z.ZodError ? 'INVALID_ARGUMENTS' : 'INTERNAL_ERROR';
        await store.security(user.id, code);
        return { content: [{ type: 'text', text: JSON.stringify({ error: { code } }) }], isError: true };
      }
    } });
  }
  register('gcp_get_connection_status', 'List only your own Google connections; never returns tokens.', z.strictObject({}), () => store.connections(user.id));
  register('gcp_list_authorized_projects', 'List connector project grants for this connection. Grants do not imply Google IAM permissions.', z.strictObject({ connectionId: z.uuid() }), async a => {
    await store.connection(user.id, a.connectionId);
    return store.projects(user.id, a.connectionId);
  });
  register('gcp_list_projects', 'Search Google-accessible projects and return ONLY connector-authorized projects. Pagination may return an empty filtered page.', z.strictObject({ connectionId: z.uuid(), pageToken: z.string().max(2048).optional() }), async a => {
    const allowed = new Set((await store.projects(user.id, a.connectionId)).map(p => p.google_project_id));
    const token = await accessToken(user, a.connectionId, env, store);
    const params = new URLSearchParams({ pageSize: '50', ...(a.pageToken ? { pageToken: a.pageToken } : {}) });
    const data = await googleRequest('cloudresourcemanager.googleapis.com', `/v3/projects:search?${params}`, token);
    const result = { projects: sanitize((data.projects || []).filter(p => allowed.has(p.projectId))), nextPageToken: data.nextPageToken };
    await store.audit(user.id, a.connectionId, 'gcp_list_projects', 'succeeded');
    return result;
  });
  for (const tool of readTools) register(tool.name, tool.description, tool.schema, a => invokeRead(tool, a, user, env, store));
  // No approval/execute tools: an AI client must not self-approve a mutation.
  return registry;
}
export async function handleMcp(request, body, user, env, store) {
  const server = new McpServer(SERVER_INFO);
  for (const tool of createToolRegistry(user, env, store).values()) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema, annotations: tool.annotations }, args => tool.invoke(args));
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 32768 });
  await server.connect(transport);
  try { return await transport.handleRequest(request, { parsedBody: body }); }
  finally { await server.close(); }
}
