# MCP integration — dual-era read-only transport

## Native 2026-07-28

`worker/src/mcp-modern.js` implements a synchronous, stateless JSON-response subset of the official 2026-07-28 HTTP protocol. Methods: `server/discover`, `ping`, `tools/list`, `tools/call`. Notifications are acknowledged with empty 202. No streaming, subscriptions, tasks, sampling or elicitation is advertised or needed for these read tools.

Each request needs bearer authentication, JSON content type, Accept listing application/json AND text/event-stream, `MCP-Protocol-Version` and `Mcp-Method`. Tool calls also need `Mcp-Name`, decoded strictly when Base64 sentinel encoded. Headers must match the body. Protocol metadata belongs in **params._meta**, not a session or top-level property:

```json
{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"my-client","version":"1"}}}}
```

Send matching `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method: server/discover`. No initialize handshake is required for this era. Results include resultType=complete and serverInfo in result._meta. Discovery/tools list include private cache scope and ttlMs=0. Inputs use JSON Schema 2020-12. No external schema refs are fetched.

Errors: parse -32700; invalid envelope -32600; invalid params/unknown tool -32602; header mismatch -32020; unsupported version -32022 with requested/supported fields; unknown method -32601 with HTTP404. Optional capability checks are unnecessary because no client-side features are invoked. Current synchronous subset is locally tested, not a claim of complete optional-protocol conformance or actual client certification.

## Legacy compatibility

2025-11-25, 2025-06-18 and 2025-03-26 remain served by official SDK 1.32.2 WebStandardStreamableHTTPServerTransport with a new stateless server per request. Legacy clients initialize normally. Both eras share the exact same tenant-aware registry, schemas, security/error handling and read callbacks. No durable Worker-memory session store, GET subscription or session DELETE is implemented.

## Independent OAuth

Worker is a protected resource, not an authorization server. Configure independent MCP issuer/audience/JWKS and registered users; only RS256/ES256 bearer JWTs with valid signature/issuer/audience/iat/exp, mcp:read scope and registered enabled subject are accepted. Google access/refresh/ID tokens are not MCP credentials. There are no invented /authorize, /token or dynamic registration endpoints.

Once configured, `/.well-known/oauth-protected-resource` advertises the external issuer and resource; 401 includes resource metadata. Right now the public development Worker lacks issuer and runtime DB configuration, so /mcp fails closed with 503 CONFIGURATION_REQUIRED; metadata returns AUTH_NOT_CONFIGURED. This deployment is not yet an actual ChatGPT connection.

Development URL: https://google-cloud-connector-development.sparkmind-support.workers.dev/mcp

Use this URL only after prerequisites are provisioned. Obtain the MCP token via the intended client's actual external OAuth flow, not a Google token or DSN. Client formats differ; no hardcoded secret-bearing sample config is committed. The dashboard offers an ephemeral in-page token workbench for already registered users; it is not a login/token issuance system and does not persist tokens in local/session storage.

## Writes and acceptance

No approve/execute Google tools are registered. Neither an AI client nor voice transcript can self-approve. Actual external client authorization, modern discovery/call and legacy negotiation must be tested against real configured accounts before production acceptance. Local tests and native schema examples do not satisfy that requirement.

References consulted:
- https://modelcontextprotocol.io/specification/2026-07-28/basic/index
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- https://github.com/modelcontextprotocol/specification/blob/main/schema/2026-07-28/schema.json
