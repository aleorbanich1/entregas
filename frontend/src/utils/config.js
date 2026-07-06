/**
 * Variables de entorno (prefijo VITE_). NUNCA claves service_role en el cliente:
 * sólo la anon key. Misma convención que la app de Tareas para permitir la fusión.
 */
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

// Ref del proyecto Supabase COMPARTIDO (documentado en PRINCIPIOS-Y-CONVENCIONES.md)
export const SUPABASE_PROJECT_REF = "qsewancpibyyakitwpnr";

// Atribución obligatoria de OpenStreetMap/Nominatim. Usar como `attribution`
// en el TileLayer de Leaflet dondequiera que se muestre un mapa.
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

// Versión de la app (mostrada en "Estado del sistema" y el diagnóstico).
export const APP_VERSION = "1.0.0";

// Clave pública VAPID para Web Push (segura para el cliente). La privada va SOLO
// en la Edge Function que envía el push. Web Push es OPCIONAL: si está vacía,
// la app funciona igual (sin push web con la app cerrada).
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

// Aviso temprano si falta configuración (sólo en dev; no rompe el build).
if (import.meta.env.DEV && (!config.supabaseUrl || !config.supabaseAnonKey)) {
  console.warn(
    "[config] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env"
  );
}
