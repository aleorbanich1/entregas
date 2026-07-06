// api.js — capa PÚBLICA que usan los componentes. Nunca importar transport.js ni
// supabaseClient.js desde un componente: todo pasa por api().
//
// Responsabilidades (mismo patrón que la app de Tareas):
//  - Delegar en transport.request().
//  - Cola offline (localforage): si no hay red, encola la mutación y la reintenta
//    al volver la conexión (flushSyncQueue).
//  - Cache liviano de /entregas para lectura offline.
import localforage from "localforage";
import { v4 as uuidv4 } from "uuid";
import { request, socket } from "./transport";

// Re-exportamos el shim de realtime con la MISMA interfaz que socket.io.
export { socket };

// Store propio del dominio Reparto (no pisa el de Tareas 'MG_Hogar_PWA').
const store = localforage.createInstance({
  name: "MG_Reparto_PWA",
  storeName: "offline_store",
  description: "cache y cola offline de Reparto",
});

const MUTATIONS = ["POST", "PUT", "PATCH", "DELETE"];

// Rutas que NO se encolan offline: consultas disfrazadas de POST (/geocode) o
// telemetría en vivo (/ubicacion — una posición vieja no sirve de nada).
const NO_QUEUE = ["/geocode", "/ubicacion"];
const isNoQueue = (path) => NO_QUEUE.some((p) => path.split("?")[0] === p);

// ── Cola de sincronización ───────────────────────────────────────────────────
async function getSyncQueue() {
  return (await store.getItem("syncQueue")) || [];
}
async function enqueueSync(op) {
  const queue = await getSyncQueue();
  if (!queue.find((o) => o.uuid === op.uuid)) {
    queue.push(op);
    await store.setItem("syncQueue", queue);
  }
}
async function dequeueSync(uuid) {
  const queue = (await getSyncQueue()).filter((o) => o.uuid !== uuid);
  await store.setItem("syncQueue", queue);
}

/** Cantidad de mutaciones en cola (para el diagnóstico de estado). */
export async function pendingCount() {
  try {
    return (await getSyncQueue()).length;
  } catch {
    return 0;
  }
}

// ── Cache de entregas (lectura offline) ──────────────────────────────────────
async function getEntregasCache() {
  return (await store.getItem("entregas")) || [];
}
async function saveEntregasCache(list) {
  await store.setItem("entregas", list);
}

// Filtra el cache según los query params conocidos (imita el filtrado del server).
function filterEntregas(list, path) {
  const params = new URLSearchParams(path.split("?")[1] || "");
  const fecha = params.get("fecha");
  const camionId = params.get("camion_id");
  const zonaId = params.get("zona_id");
  const estado = params.get("estado");
  return list.filter((e) => {
    if (fecha && e.fecha_entrega !== fecha) return false;
    if (camionId && Number(e.camion_id) !== Number(camionId)) return false;
    if (zonaId && Number(e.zona_id) !== Number(zonaId)) return false;
    if (estado && e.estado !== estado) return false;
    return true;
  });
}

const isEntregasList = (path) => path.split("?")[0] === "/entregas";
const isEntregaItem = (path) => path.split("?")[0].startsWith("/entregas/");

// ── Punto de entrada único ───────────────────────────────────────────────────
export async function api(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();

  // ── GET: stale-while-revalidate para /entregas; el resto va directo ──
  if (method === "GET") {
    if (navigator.onLine) await flushSyncQueue();

    if (!navigator.onLine) {
      if (isEntregasList(path)) return filterEntregas(await getEntregasCache(), path);
      if (isEntregaItem(path)) {
        const id = Number(path.split("?")[0].slice("/entregas/".length));
        return (await getEntregasCache()).find((e) => Number(e.id) === id) || null;
      }
    }

    try {
      const data = await request(path, "GET");
      if (isEntregasList(path) && Array.isArray(data)) await saveEntregasCache(data);
      return data;
    } catch (err) {
      if (isEntregasList(path)) return filterEntregas(await getEntregasCache(), path);
      if (isEntregaItem(path)) {
        const id = Number(path.split("?")[0].slice("/entregas/".length));
        return (await getEntregasCache()).find((e) => Number(e.id) === id) || null;
      }
      throw err;
    }
  }

  // ── Mutaciones ──
  const opUuid = uuidv4();
  try {
    const data = await request(path, method, opts.body);
    flushSyncQueue(); // por si había algo pendiente
    return data;
  } catch (err) {
    const isNetwork = err.isNetwork || err instanceof TypeError || !navigator.onLine;
    if (isNetwork && MUTATIONS.includes(method) && !isNoQueue(path)) {
      await enqueueSync({ path, method, body: opts.body || null, uuid: opUuid });
      return { __queued: true, offline: true, uuid: opUuid };
    }
    throw err;
  }
}

// ── Flush de la cola (al volver la conexión) ─────────────────────────────────
let flushing = false;
export async function flushSyncQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const queue = await getSyncQueue();
    for (const op of queue) {
      try {
        await request(op.path, op.method, op.body);
        await dequeueSync(op.uuid);
      } catch (err) {
        if (err.isNetwork) break; // sin red: reintentar al volver online
        await dequeueSync(op.uuid); // error permanente (validación/RLS): descartar
      }
    }
  } finally {
    flushing = false;
  }
}

// Auto-flush al recuperar conexión.
if (typeof window !== "undefined") {
  window.addEventListener("online", flushSyncQueue);
}
