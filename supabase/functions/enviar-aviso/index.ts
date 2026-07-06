// Edge Function: enviar-aviso
// Envía una notificación Web Push a TODAS las suscripciones guardadas
// (push_subscriptions), para que "hoja de ruta lista" y "día cerrado" lleguen
// aunque la app esté cerrada. La llama el front (transport.js) al publicar la
// hoja / cerrar el día.
//
// Requiere estos secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta el runtime.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title, body, url, tag } = await req.json().catch(() => ({}));

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@mghogar.local";
    if (!publicKey || !privateKey) {
      return json({ error: "Faltan las llaves VAPID (secrets)" }, 400);
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    if (error) throw error;

    const payload = JSON.stringify({
      title: title || "MG Reparto",
      body: body || "",
      url: url || "/reparto",
      tag: tag || "reparto",
    });

    let enviados = 0;
    let limpiados = 0;
    for (const s of subs || []) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, payload);
        enviados++;
      } catch (e: any) {
        const code = e?.statusCode;
        // Suscripción vencida/invalida → la borramos para no reintentar siempre.
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          limpiados++;
        }
      }
    }

    return json({ ok: true, enviados, limpiados });
  } catch (e) {
    // Nunca romper el flujo de la app: si algo falla, devolvemos 200 con el detalle.
    return json({ ok: false, error: String(e) });
  }
});
