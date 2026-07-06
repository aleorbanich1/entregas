// webPush.js — Suscripción a Web Push para la PWA (navegador). OPCIONAL.
// Guarda la suscripción del navegador en Supabase (tabla push_subscriptions,
// compartida con la app de Tareas). Una Edge Function con la clave privada VAPID
// envía el push, así suena aunque la pestaña/app esté cerrada. No-op si no hay
// VAPID_PUBLIC_KEY o el navegador no soporta push.
import { supabase } from "./supabaseClient";
import { VAPID_PUBLIC_KEY } from "./config";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export async function ensureWebPushSubscription(userId) {
  if (!supported() || !VAPID_PUBLIC_KEY) return;
  try {
    if (Notification.permission === "denied") return;
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: Number(userId),
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      { onConflict: "endpoint" }
    );
  } catch (e) {
    console.warn("[webpush] no se pudo suscribir", e);
  }
}
