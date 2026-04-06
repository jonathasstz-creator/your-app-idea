import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-external-auth",
};

const API_BASE = "https://api.devoltecomele.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // Prefer x-external-auth (the real backend token) over the Lovable Cloud authorization header
    const externalAuth = req.headers.get("x-external-auth");
    const authHeader = req.headers.get("authorization");

    if (externalAuth) {
      headers["Authorization"] = externalAuth;
    } else if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(`${API_BASE}/v1/catalog`, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[catalog-proxy] Backend returned ${response.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Backend returned ${response.status}`, detail: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[catalog-proxy] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch catalog from backend", detail: String(error) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
