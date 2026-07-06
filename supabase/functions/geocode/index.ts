// Edge Function: geocode
// Recibe { direccion } y devuelve { lat, lng } (o geocode_status 'fallo' sin romper).
//
// Flujo:
//  1) Normaliza la dirección y busca en entregas_geocache → si está, la devuelve.
//  2) Si no, llama a Nominatim (countrycodes=ar, limit=1) con User-Agent que
//     incluye entregas_config.contacto_email, respetando ~1 request/segundo.
//  3) Cachea SIEMPRE el resultado (encontrado o no) en entregas_geocache.
//  4) Ante fallo transitorio (bloqueo/red/HTTP) devuelve geocode_status 'fallo'.
//
// Registra cada intento EXTERNO en entregas_geocode_log:
//  'ok' | 'no_encontrada' | 'bloqueado' (429/403 o "Usage limit reached") | 'error'.
//
// Sin autocompletado. La atribución "© OpenStreetMap contributors" va en el mapa
// (front), no acá.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normaliza para usar como clave de caché: sin acentos, minúsculas, espacios colapsados.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Admin = ReturnType<typeof createClient>;

// Registro de intento externo (nunca rompe el flujo).
async function log(admin: Admin, resultado: string, detalle: string) {
  try {
    await admin
      .from("entregas_geocode_log")
      .insert({ resultado, detalle: detalle?.slice(0, 500) ?? null });
  } catch (_) {
    // logging best-effort
  }
}

// Throttle ~1 req/seg global: espacia según el último intento registrado.
async function throttle(admin: Admin) {
  try {
    const { data } = await admin
      .from("entregas_geocode_log")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.created_at) {
      const gap = Date.now() - new Date(data.created_at).getTime();
      if (gap >= 0 && gap < 1100) {
        await new Promise((r) => setTimeout(r, 1100 - gap));
      }
    }
  } catch (_) {
    // si no se puede consultar, seguimos igual
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { direccion } = await req.json().catch(() => ({}));
    if (!direccion || typeof direccion !== "string" || !direccion.trim()) {
      return json({ geocode_status: "fallo", error: "direccion requerida" }, 400);
    }

    const norm = normalize(direccion);

    // 1) Caché
    const { data: cached } = await admin
      .from("entregas_geocache")
      .select("lat,lng")
      .eq("direccion_norm", norm)
      .maybeSingle();

    if (cached) {
      const status =
        cached.lat != null && cached.lng != null ? "ok" : "no_encontrada";
      return json({
        lat: cached.lat,
        lng: cached.lng,
        geocode_status: status,
        cached: true,
      });
    }

    // 2) Nominatim. User-Agent con el email de contacto de la config.
    const { data: cfg } = await admin
      .from("entregas_config")
      .select("contacto_email")
      .eq("id", 1)
      .maybeSingle();
    const email = cfg?.contacto_email || "reparto@mghogar.local";

    await throttle(admin);

    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=" +
      encodeURIComponent(`${direccion.trim()}, Argentina`);

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: {
          "User-Agent": `MG-Hogar-Reparto/1.0 (${email})`,
          "Accept": "application/json",
          "Accept-Language": "es",
        },
      });
    } catch (e) {
      await log(admin, "error", `fetch: ${e}`);
      return json({ geocode_status: "fallo", error: "error" });
    }

    const bodyText = await resp.text();

    // Bloqueo/cuota: 429/403 o mensaje explícito de Nominatim.
    if (
      resp.status === 429 ||
      resp.status === 403 ||
      /usage limit reached/i.test(bodyText)
    ) {
      await log(admin, "bloqueado", `HTTP ${resp.status}`);
      return json({ geocode_status: "fallo", error: "bloqueado" });
    }

    if (!resp.ok) {
      await log(admin, "error", `HTTP ${resp.status}`);
      return json({ geocode_status: "fallo", error: "error" });
    }

    let arr: Array<{ lat?: string; lon?: string }> = [];
    try {
      arr = JSON.parse(bodyText);
    } catch {
      arr = [];
    }

    // 3) Cachear SIEMPRE (encontrado o no).
    if (!Array.isArray(arr) || arr.length === 0) {
      await admin
        .from("entregas_geocache")
        .upsert({ direccion_norm: norm, lat: null, lng: null });
      await log(admin, "no_encontrada", direccion);
      return json({ lat: null, lng: null, geocode_status: "no_encontrada" });
    }

    const lat = Number(arr[0].lat);
    const lng = Number(arr[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      await admin
        .from("entregas_geocache")
        .upsert({ direccion_norm: norm, lat: null, lng: null });
      await log(admin, "no_encontrada", `sin coords: ${direccion}`);
      return json({ lat: null, lng: null, geocode_status: "no_encontrada" });
    }

    await admin
      .from("entregas_geocache")
      .upsert({ direccion_norm: norm, lat, lng });
    await log(admin, "ok", direccion);
    return json({ lat, lng, geocode_status: "ok" });
  } catch (e) {
    // 4) Nunca romper: cualquier excepción → 'fallo'.
    await log(admin, "error", `excepcion: ${e}`);
    return json({ geocode_status: "fallo", error: "error" });
  }
});
