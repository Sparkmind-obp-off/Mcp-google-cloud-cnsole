# API and tool reference — development release

## HTTP

| Method / path | Authentication and input | Response |
|---|---|---|
| GET `/health` | Public | Liveness, development stage, productionReady=false, writesEnabled=false, voiceImplemented=false |
| GET `/ready` | Public, no diagnostic secrets | 503 CONFIGURATION_REQUIRED or DATABASE_NOT_READY; 200 readiness when required config and schema version exist; productionReady remains false |
| GET `/.well-known/oauth-protected-resource` | Configured origin/issuer | External authorization server metadata |
| POST `/oauth/google/start` | Registered bearer JWT, exact Origin, JSON `{}` | authorizationUrl + secure HttpOnly binding cookie; no tokens |
| GET `/oauth/google/callback` | state, code and same-browser cookie | Consumes state once and encrypts validated Google tokens; safe text success or code-only failure |
| POST `/connections/disconnect` | Registered bearer JWT, exact Origin, JSON `{connectionId,confirm:"disconnect"}` | Explicit provider revoke followed by local token erasure |
| POST `/mcp` | Registered bearer JWT, JSON-RPC and compatible Accept headers | Official SDK protocol replies; not an unrestricted API proxy |

No public approvals, execution, user administration, project grant administration, voice, file upload or AI proxy endpoints exist.

## MCP tools

All input objects reject unknown keys. `connectionId` is a UUID. `projectId` is a validated Google project ID, not a URL/path. Every project read verifies connector grant before contacting Google, checks read OAuth scope, then relies on the actual Google API to enforce current IAM/API/prerequisites. HTTP 403 never becomes a fake empty success. Most list tools support pageSize 1..100 (default 50) and bounded opaque pageToken. Responses are `structuredContent:{data:...}` plus text JSON; failures use isError and a safe error code.

| Tool | Required arguments (besides common connectionId/projectId where applicable) | Google permission / prerequisite |
|---|---|---|
| gcp_get_connection_status | none | Registered user; no project args |
| gcp_list_authorized_projects | connectionId only | Own active connection; connector grants, not proof of IAM |
| gcp_list_projects | connectionId, optional pageToken | Resource Manager projects search; results filtered by connector project allowlist |
| gcp_get_project | common | resourcemanager.projects.get |
| gcp_get_project_iam_policy | common | resourcemanager.projects.getIamPolicy; read-only POST method |
| gcp_list_compute_instances | common, zone | compute.instances.list; Compute API |
| gcp_get_compute_instance | common, zone, instance | compute.instances.get |
| gcp_list_compute_zones | common | compute.zones.list |
| gcp_list_machine_types | common, zone | compute.machineTypes.list |
| gcp_list_cloud_run_services | common, region | run.services.list; Cloud Run API |
| gcp_get_cloud_run_service | common, region, service | run.services.get |
| gcp_list_cloud_run_revisions | common, region, service | run.revisions.list |
| gcp_list_storage_buckets | common | storage.buckets.list; Storage API |
| gcp_get_storage_bucket | common, bucket | storage.buckets.get plus Resource Manager project get for project-number match |
| gcp_list_sql_instances | common | cloudsql.instances.list; Cloud SQL Admin API |
| gcp_get_sql_instance | common, instance | cloudsql.instances.get |
| gcp_query_logs | common, startTime, endTime, optional severity | logging.logEntries.list; Logging API; max 24h range, fixed selected project filter, no raw log payloads |
| gcp_get_billing_info | common | Project billing association API, resourcemanager.projects.get; not budget/account writes |

Raw VM metadata, Cloud Run env/args/commands and raw log payloads are redacted. Sensitive configuration inspection is therefore intentionally incomplete. Pagination cursors are allowed through; these are not OAuth tokens. Budget reads are NOT IMPLEMENTED. No Google write scopes or write tools are registered.

## Consistent safe errors

HTTP envelopes: `{error:{code}}`. MCP tool errors return `isError:true` with code-only content. Examples:
- UNAUTHENTICATED (401), INSUFFICIENT_SCOPE / USER_NOT_REGISTERED (403)
- ORIGIN_NOT_ALLOWED / ORIGIN_REQUIRED / HOST_NOT_ALLOWED (403)
- CONFIGURATION_REQUIRED / AUTH_NOT_CONFIGURED (503)
- INVALID_OAUTH_STATE / GOOGLE_IDENTITY_INVALID (400)
- CONNECTION_NOT_FOUND (404), PROJECT_NOT_AUTHORIZED / BUCKET_PROJECT_MISMATCH (403)
- GOOGLE_SCOPE_MISSING / GOOGLE_API_NOT_ENABLED / GOOGLE_IAM_PERMISSION_DENIED (403)
- GOOGLE_REAUTHORIZE_REQUIRED (401), GOOGLE_RESOURCE_NOT_FOUND (404), GOOGLE_API_UNAVAILABLE (502)
- PAYLOAD_TOO_LARGE (413), RATE_LIMITED / GOOGLE_RATE_LIMITED (429), INVALID_ARGUMENTS (400)
- UNSUPPORTED_MCP_PROTOCOL (400)

Provider exception strings, DSNs, bearer values and raw Google error messages are not returned. Actual Google permissions and API enablement remain unverified until live test-project checks run.
