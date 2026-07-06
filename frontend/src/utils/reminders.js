// reminders.js — Orquestador de notificaciones multiplataforma (misma fachada
// que usa NotificationGate / health en la app de Tareas).
//
//   • APK (Capacitor):  notificaciones locales nativas (canal 'avisos').
//   • Web (PWA):         Notification API + Web Push opcional (VAPID) para que
//                        el aviso llegue con la app cerrada (vía Edge Function).
//
// Estados: 'granted' | 'denied' | 'default'/'prompt' | 'unsupported'.
import {
  isNative,
  initNativeNotifications,
  nativePermissionState,
  notifyNative,
} from "./nativeNotifications";
import { ensureWebPushSubscription } from "./webPush";

/** Estado del permiso, sin pedirlo (unificado web/APK). */
export async function notificationStatus() {
  if (isNative()) return await nativePermissionState();
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

/** Pide permiso (gesto del usuario) y deja todo listo (canal nativo / push web). */
export async function requestNotifications(userId) {
  if (isNative()) {
    await initNativeNotifications();
  } else {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      try {
        await Notification.requestPermission();
      } catch {
        // ignorar
      }
    }
    await ensureWebPushSubscription(userId); // no-op si no hay VAPID
  }
  return await notificationStatus();
}

/**
 * Notificación INMEDIATA de un evento recibido en vivo (hoja publicada / día
 * cerrado). Web: Notification API; APK: notificación local nativa.
 */
export async function notify(title, body) {
  if (isNative()) {
    await notifyNative(title, body);
    return;
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body: body || "" });
    }
  } catch {
    // no crítico
  }
}

export { isNative };
