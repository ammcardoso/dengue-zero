// @ts-nocheck
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const geocode = url.searchParams.get("geocode") || "4113700";
    const ew_start = url.searchParams.get("ew_start") || "1";
    const ew_end = url.searchParams.get("ew_end") || "52";
    const ey_start = url.searchParams.get("ey_start") || "2026";
    const ey_end = url.searchParams.get("ey_end") || "2026";

    const apiUrl = `https://info.dengue.mat.br/api/alertcity?geocode=${geocode}&disease=dengue&format=json&ew_start=${ew_start}&ew_end=${ew_end}&ey_start=${ey_start}&ey_end=${ey_end}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});