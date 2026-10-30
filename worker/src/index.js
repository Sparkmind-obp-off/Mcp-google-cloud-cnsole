const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}
function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(value) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "google-cloud-connector",
        stage: "scaffold",
        mcpEnabled: false,
        googleOAuthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI)
      });
    }

    // Scaffold only: state is one-time and short-lived, but no token is persisted.
    if (request.method === "GET" && url.pathname === "/oauth/google/start") {
      if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
        return json({ error: "Google OAuth or D1 is not configured" }, 503);
      }
      const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const stateHash = await sha256(state);
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        "INSERT INTO oauth_states (state_hash, created_at, expires_at) VALUES (?, ?, ?)"
      ).bind(stateHash, now, now + 600).run();

      const auth = new URL(GOOGLE_AUTH);
      auth.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: "openid email https://www.googleapis.com/auth/cloud-platform.read-only",
        access_type: "offline",
        prompt: "consent",
        state
      }).toString();
      return Response.redirect(auth.toString(), 302);
    }

    if (request.method === "GET" && url.pathname === "/oauth/google/callback") {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (url.searchParams.has("error")) return html("<h1>Google authorization was not completed.</h1>", 400);
      if (!state || !code || !env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
        return json({ error: "Invalid or incomplete OAuth callback" }, 400);
      }

      const stateHash = await sha256(state);
      const now = Math.floor(Date.now() / 1000);
      const row = await env.DB.prepare(
        "SELECT state_hash FROM oauth_states WHERE state_hash = ? AND expires_at > ?"
      ).bind(stateHash, now).first();
      if (!row) return json({ error: "OAuth state invalid, expired, or already used" }, 400);
      await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash = ?").bind(stateHash).run();

      const tokenResponse = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code"
        })
      });
      if (!tokenResponse.ok) {
        return json({ error: "Google token exchange failed", upstreamStatus: tokenResponse.status }, 502);
      }

      // Deliberately do not persist the token: encrypted token storage and account
      // binding must be implemented and tested before enabling a real connection.
      const token = await tokenResponse.json();
      if (!token.refresh_token) {
        return html("<h1>Google did not return a refresh token.</h1><p>No token was stored.</p>", 400);
      }
      return html("<h1>OAuth code exchange succeeded.</h1><p>This scaffold intentionally discarded the token. No Google Cloud connection is active yet.</p>");
    }

    if (url.pathname === "/mcp") {
      return json({
        error: "MCP is disabled until MCP OAuth, encrypted token storage, request authorization, and approval-gated tools are implemented."
      }, 501);
    }

    return json({ error: "Not found" }, 404);
  }
};
