import { z } from 'zod';
import { accessToken, BILLING_SCOPE } from './oauth.js';
import { fail } from './security.js';

const connectionId = z.uuid();
const projectId = z.string().regex(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/);
const segment = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const base = { connectionId, projectId };
const region = z.string().regex(/^[a-z]+-[a-z]+[0-9]+$/);
const zone = z.string().regex(/^[a-z]+-[a-z]+[0-9]+-[a-z]$/);
const page = { pageSize: z.number().int().min(1).max(100).default(50), pageToken: z.string().max(2048).optional() };
const query = object => { const p = new URLSearchParams(); for (const [k,v] of Object.entries(object)) if (v !== undefined) p.set(k, String(v)); return `?${p}`; };
function definition(name, description, shape, api, permission, path, options = {}) {
  return { name, description, schema: z.strictObject(shape), api, permission, path, ...options };
}
export const readTools = [
  definition('gcp_get_project', 'Get an explicitly authorized project. Requires Cloud Resource Manager API and resourcemanager.projects.get.', base,
    'cloudresourcemanager.googleapis.com', 'resourcemanager.projects.get', a => `/v3/projects/${a.projectId}`),
  definition('gcp_get_project_iam_policy', 'Read IAM policy. OAuth consent does not grant IAM permissions.', base,
    'cloudresourcemanager.googleapis.com', 'resourcemanager.projects.getIamPolicy', a => `/v3/projects/${a.projectId}:getIamPolicy`, { method: 'POST', body: () => ({ options: { requestedPolicyVersion: 3 } }) }),
  definition('gcp_list_compute_instances', 'List VMs in one zone. Zone is required; no unrestricted cross-project aggregation.', { ...base, zone, ...page },
    'compute.googleapis.com', 'compute.instances.list', a => `/compute/v1/projects/${a.projectId}/zones/${a.zone}/instances${query({ maxResults: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_get_compute_instance', 'Read a VM and its current status.', { ...base, zone, instance: segment },
    'compute.googleapis.com', 'compute.instances.get', a => `/compute/v1/projects/${a.projectId}/zones/${a.zone}/instances/${a.instance}`),
  definition('gcp_list_compute_zones', 'List available Compute Engine zones.', { ...base, ...page },
    'compute.googleapis.com', 'compute.zones.list', a => `/compute/v1/projects/${a.projectId}/zones${query({ maxResults: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_list_machine_types', 'List machine types in a zone.', { ...base, zone, ...page },
    'compute.googleapis.com', 'compute.machineTypes.list', a => `/compute/v1/projects/${a.projectId}/zones/${a.zone}/machineTypes${query({ maxResults: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_list_cloud_run_services', 'List Cloud Run services in an authorized project and region.', { ...base, region, ...page },
    'run.googleapis.com', 'run.services.list', a => `/v2/projects/${a.projectId}/locations/${a.region}/services${query({ pageSize: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_get_cloud_run_service', 'Read Cloud Run configuration and deployment status. Environment values are redacted.', { ...base, region, service: segment },
    'run.googleapis.com', 'run.services.get', a => `/v2/projects/${a.projectId}/locations/${a.region}/services/${a.service}`),
  definition('gcp_list_cloud_run_revisions', 'List revisions of a Cloud Run service.', { ...base, region, service: segment, ...page },
    'run.googleapis.com', 'run.revisions.list', a => `/v2/projects/${a.projectId}/locations/${a.region}/services/${a.service}/revisions${query({ pageSize: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_list_storage_buckets', 'List bucket metadata; does not read object contents.', { ...base, ...page },
    'storage.googleapis.com', 'storage.buckets.list', a => `/storage/v1/b${query({ project: a.projectId, maxResults: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_get_storage_bucket', 'Read a bucket. The response project number is checked against the selected project.', { ...base, bucket: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/) },
    'storage.googleapis.com', 'storage.buckets.get', a => `/storage/v1/b/${encodeURIComponent(a.bucket)}`, { bucketCheck: true }),
  definition('gcp_list_sql_instances', 'List Cloud SQL instance metadata.', { ...base, ...page },
    'sqladmin.googleapis.com', 'cloudsql.instances.list', a => `/sql/v1beta4/projects/${a.projectId}/instances${query({ maxResults: a.pageSize, pageToken: a.pageToken })}`),
  definition('gcp_get_sql_instance', 'Read Cloud SQL instance configuration.', { ...base, instance: segment },
    'sqladmin.googleapis.com', 'cloudsql.instances.get', a => `/sql/v1beta4/projects/${a.projectId}/instances/${a.instance}`),
  definition('gcp_query_logs', 'Read logs in a bounded time range (maximum 24 hours). Log payload contents may contain application secrets; raw payloads are omitted.', {
    ...base, startTime: z.iso.datetime(), endTime: z.iso.datetime(), severity: z.enum(['DEFAULT','DEBUG','INFO','NOTICE','WARNING','ERROR','CRITICAL','ALERT','EMERGENCY']).optional(), ...page
  }, 'logging.googleapis.com', 'logging.logEntries.list', () => '/v2/entries:list', {
    method: 'POST', body: a => {
      const start = Date.parse(a.startTime), end = Date.parse(a.endTime);
      if (end <= start || end - start > 86400000 || end > Date.now() + 60000) fail('INVALID_LOG_RANGE', 400);
      return { resourceNames: [`projects/${a.projectId}`], filter: `timestamp >= "${a.startTime}" AND timestamp <= "${a.endTime}"${a.severity ? ` AND severity >= ${a.severity}` : ''}`, orderBy: 'timestamp desc', pageSize: a.pageSize, ...(a.pageToken ? { pageToken: a.pageToken } : {}) };
    }
  }),
  definition('gcp_get_billing_info', 'Read project billing association. Budget and billing account modifications are not supported.', base,
    'cloudbilling.googleapis.com', 'resourcemanager.projects.get', a => `/v1/projects/${a.projectId}/billingInfo`),
  definition('gcp_list_billing_budgets', 'Read budgets explicitly scoped to the selected project. Requires opt-in, cloud-billing OAuth scope, billing.budgets.list and project billing association access; never modifies budgets.', { ...base, ...page },
    'billingbudgets.googleapis.com', 'billing.budgets.list', () => '', { budgetRead: true })
];
// Do not send instance metadata, env values, SQL user data or raw log payloads to clients.
export function sanitize(value, depth = 0) {
  if (depth > 30) return '[OMITTED]';
  if (Array.isArray(value)) return value.map(v => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,
      k !== 'nextPageToken' && /token|password|secret|privatekey|clientkey|certificate|metadata|textpayload|jsonpayload|protopayload|startup|sshkeys|^env$|^value$|^args$|^command$/i.test(k)
        ? '[REDACTED]' : sanitize(v, depth + 1)]));
  }
  return value;
}
export async function googleRequest(api, path, token, options = {}, fetcher = fetch) {
  if (!readTools.some(t => t.api === api) || !path.startsWith('/') || path.startsWith('//')) fail('API_NOT_ALLOWED', 400);
  const response = await fetcher(`https://${api}${path}`, {
    method: options.method || 'GET', headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    // Never return provider messages, request URLs, or tokens. ErrorInfo reason is allowlisted.
    let reason;
    try { const body = await response.json(); reason = body.error?.details?.find(d => d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo')?.reason; } catch { /* generic error below */ }
    if (reason === 'SERVICE_DISABLED') fail('GOOGLE_API_NOT_ENABLED', 403);
    if (reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') fail('GOOGLE_SCOPE_MISSING', 403);
    if (response.status === 401) fail('GOOGLE_REAUTHORIZE_REQUIRED', 401);
    if (response.status === 403) fail('GOOGLE_IAM_PERMISSION_DENIED', 403);
    if (response.status === 404) fail('GOOGLE_RESOURCE_NOT_FOUND', 404);
    if (response.status === 429) fail('GOOGLE_RATE_LIMITED', 429);
    fail('GOOGLE_API_UNAVAILABLE', 502);
  }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.length; if (size > 1048576) { await reader.cancel(); fail('GOOGLE_RESPONSE_TOO_LARGE', 502); } chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('GOOGLE_INVALID_RESPONSE', 502); }
}
export async function invokeRead(tool, input, user, env, store, fetcher = fetch) {
  const args = tool.schema.parse(input);
  await store.project(user.id, args.connectionId, args.projectId);
  if (tool.budgetRead) {
    if (env.ENABLE_BUDGET_READ !== 'true') fail('BUDGET_READ_NOT_ENABLED', 403);
    const connection = await store.connection(user.id, args.connectionId);
    if (!connection.scopes.includes(BILLING_SCOPE)) fail('BILLING_SCOPE_REQUIRED', 403);
  }
  const token = await accessToken(user, args.connectionId, env, store, fetcher);
  const options = { method: tool.method, body: tool.body?.(args) };
  let data;
  if (tool.budgetRead) {
    // Refresh may narrow the stored grant. Recheck before making a billing request.
    if (!(await store.connection(user.id, args.connectionId)).scopes.includes(BILLING_SCOPE)) fail('BILLING_SCOPE_REQUIRED', 403);
    const association = await googleRequest('cloudbilling.googleapis.com', `/v1/projects/${args.projectId}/billingInfo`, token, {}, fetcher);
    if (!/^billingAccounts\/[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(association.billingAccountName || '')) fail('BILLING_ACCOUNT_UNAVAILABLE', 403);
    const project = await googleRequest('cloudresourcemanager.googleapis.com', `/v3/projects/${args.projectId}`, token, {}, fetcher);
    if (!/^projects\/[0-9]+$/.test(project.name || '')) fail('GOOGLE_INVALID_RESPONSE', 502);
    const params = query({ scope: `projects/${args.projectId}`, pageSize: args.pageSize, pageToken: args.pageToken });
    data = await googleRequest(tool.api, `/v1/${association.billingAccountName}/budgets${params}`, token, {}, fetcher);
    const selected = new Set([`projects/${args.projectId}`, project.name]);
    // Exclude account-wide/mixed-project totals to avoid leaking another project's spend.
    data = { ...data, budgets: (data.budgets || []).filter(b => Array.isArray(b.budgetFilter?.projects) && b.budgetFilter.projects.length > 0 && b.budgetFilter.projects.every(p => selected.has(p))) };
  } else {
    data = await googleRequest(tool.api, tool.path(args), token, options, fetcher);
  }
  if (tool.bucketCheck) {
    const project = await googleRequest('cloudresourcemanager.googleapis.com', `/v3/projects/${args.projectId}`, token, {}, fetcher);
    if (!project.name || !data.projectNumber || String(data.projectNumber) !== project.name.replace('projects/', '')) fail('BUCKET_PROJECT_MISMATCH', 403);
  }
  await store.audit(user.id, args.connectionId, tool.name, 'succeeded');
  return sanitize(data);
}
