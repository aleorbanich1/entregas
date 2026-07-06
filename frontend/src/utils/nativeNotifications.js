// nativeNotifications.js — Notificaciones NATIVAS para el APK (Capacitor Android).
// Se usan para avisar "hoja de ruta lista" y "día cerrado". En web no hacen nada
// (isNative() es false) y se cae a la Notification API / Web Push.
import { Capacitor } from "@capacitor/core";

const CHANNEL_ID = "avisos";

export function isNative() {
  try {
    return Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// Carga perezosa del plugin (no existe en la web).
let _plugin = null;
async function getPlugin() {
  if (!isNative()) return null;
  if (!_plugin) {
    const mod = await import("@capacitor/local-notifications");
    _plugin = mod.LocalNotifications;
  }
  return _plugin;
}

// Pide permiso y crea el canal Android con sonido + importancia alta (para que suene).
export async function initNativeNotifications() {
  const LN = await getPlugin();
  if (!LN) return false;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== "granted") perm = await LN.requestPermissions();
    if (perm.display !== "granted") return false;
  } catch (e) {
    console.warn("[native] permiso de notificación falló", e);
    return false;
  }
  try {
    await LN.createChannel({
      id: CHANNEL_ID,
      name: "Avisos de reparto",
      description: "Hojas de ruta publicadas y cierres de día",
      importance: 5, // HIGH → suena y aparece encima
      visibility: 1, // público en pantalla bloqueada
      vibration: true,
      sound: undefined, // sonido de notificación por defecto del sistema
    });
  } catch (e) {
    console.warn("[native] no se pudo crear el canal", e);
  }
  return true;
}

// Estado del permiso nativo: 'granted' | 'denied' | 'prompt' | 'unsupported'.
export async function nativePermissionState() {
  const LN = await getPlugin();
  if (!LN) return "unsupported";
  try {
    const p = await LN.checkPermissions();
    return p.display || "prompt";
  } catch {
    return "unsupported";
  }
}

// Notificación nativa INMEDIATA (para un evento recién recibido).
let _seq = 1;
export async function notifyNative(title, body) {
  const LN = await getPlugin();
  if (!LN) return;
  try {
    await LN.schedule({
      notifications: [
        {
          id: (Date.now() % 2000000000) + _seq++,
          channelId: CHANNEL_ID,
          title,
          body: body || "",
          schedule: { at: new Date(Date.now() + 300), allowWhileIdle: true },
        },
      ],
    });
  } catch (e) {
    console.warn("[native] no se pudo notificar", e);
  }
}
