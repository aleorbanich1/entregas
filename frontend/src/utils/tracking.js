// tracking.js — publica la posición del camión mientras el repartidor está en ruta.
// Vive a nivel de módulo (no de componente) para que el watchPosition sobreviva a
// cambios de pestaña; sólo se detiene con stopTracking() ("cerrar día") o al recargar.
import { api } from "./api";

let watchId = null;
let camionId = null;
let lastPublish = 0;
const THROTTLE_MS = 12000; // no floodear: publicar como mucho cada ~12s

export function isTracking() {
  return watchId != null;
}

/**
 * Empieza a seguir la posición y a publicarla en entregas_camion_ubicacion.
 * @param {number|string} cam  id del camión de hoy
 * @param {(lat:number,lng:number)=>void} [onUpdate]
 * @param {(err:any)=>void} [onError]
 * @returns {boolean} si pudo iniciar
 */
export function startTracking(cam, onUpdate, onError) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError?.("sin_geolocalizacion");
    return false;
  }
  camionId = cam;
  if (watchId != null) return true; // ya activo (varias entregas "en camino")

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (lat == null || lng == null) return;
      onUpdate?.(lat, lng);
      const now = Date.now();
      if (now - lastPublish < THROTTLE_MS) return;
      lastPublish = now;
      // /ubicacion no se encola offline (posición vieja no sirve); si falla, se ignora.
      api("/ubicacion", { method: "POST", body: { camion_id: camionId, lat, lng } }).catch(
        () => {}
      );
    },
    (err) => onError?.(err),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
  return true;
}

/** Detiene el seguimiento ("cerrar día"). */
export function stopTracking() {
  if (watchId != null && typeof navigator !== "undefined") {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  camionId = null;
  lastPublish = 0;
}
