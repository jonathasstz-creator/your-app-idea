import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-external-auth, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const API_BASE = "https://api.devoltecomele.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Extract the upstream path from the URL.
    // The edge function is invoked at /functions/v1/api-proxy/...
    // We want everything after "/api-proxy" to be forwarded.
    const url = new URL(req.url);
    const fnPrefix = "/api-proxy";
    let upstreamPath = url.pathname;

    // Strip the edge-function prefix (handles both /api-proxy/... and /functions/v1/api-proxy/...)
    const idx = upstreamPath.indexOf(fnPrefix);
    if (idx !== -1) {
      upstreamPath = upstreamPath.slice(idx + fnPrefix.length);
    }

    // Ensure path starts with /
    if (!upstreamPath.startsWith("/")) {
      upstreamPath = "/" + upstreamPath;
    }

    // Build upstream URL with query string
    const upstreamUrl = `${API_BASE}${upstreamPath}${url.search}`;

    // Build headers for upstream request
    const upstreamHeaders: Record<string, string> = {
      Accept: "application/json",
    };

    // Forward Content-Type if present
    const ct = req.headers.get("content-type");
    if (ct) upstreamHeaders["Content-Type"] = ct;

    // Forward Idempotency-Key if present
    const idemKey = req.headers.get("idempotency-key");
    if (idemKey) upstreamHeaders["Idempotency-Key"] = idemKey;

    // Auth: prefer x-external-auth over authorization
    const externalAuth = req.headers.get("x-external-auth");
    const authHeader = req.headers.get("authorization");
    if (externalAuth) {
      upstreamHeaders["Authorization"] = externalAuth;
    } else if (authHeader) {
      upstreamHeaders["Authorization"] = authHeader;
    }

    // Forward body for methods that have one
    let body: BodyInit | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.arrayBuffer();
      if ((body as ArrayBuffer).byteLength === 0) body = null;
    }

    console.log(`[api-proxy] ${req.method} ${upstreamPath}${url.search}`);

    const response = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body,
    });

    // Stream back the response
    const responseBody = await response.arrayBuffer();
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
    };

    // Forward content-type from upstream
    const resCt = response.headers.get("content-type");
    if (resCt) responseHeaders["Content-Type"] = resCt;

    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[api-proxy] Error:", error);
    return new Response(
      JSON.stringify({ error: "Proxy request failed", detail: String(error) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
