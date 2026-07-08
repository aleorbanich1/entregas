// transport.js — Traduce las llamadas api(path, opts) del frontend a operaciones
// directas contra Supabase (anon key + RLS). Mismo patrón que la app de Tareas.
// La capa offline (api.js) NO cambia: sólo cambia "el transporte".
//
// Dominio Reparto: tablas entregas_* (no chocan con tasks/messages de Tareas).
// Ningún componente toca supabase directo: todo pasa por api() → request()/socket.
import { supabase } from "./supabaseClient";

// Embebido de relaciones (FKs de entregas → zonas/camiones). Los eventos realtime
// llegan sin los JOIN, por eso re-consultamos con este select al enriquecer.
const ENTREGA_SELECT =
  "*, zona:entregas_zonas(id,nombre), camion:entregas_camiones(id,nombre,patente)";

// Usuario actual (mg_user lo setea auth.js). id (bigint) = users.id.
function me() {
  try {
    return JSON.parse(localStorage.getItem("mg_user") || "{}");
  } catch {
    return {};
  }
}

// Marca el error como "de red" para que api.js encole la mutación offline.
function wrapError(error) {
  const msg = error?.message || "Error";
  if (!navigator.onLine || /fetch|network|failed to fetch|timeout/i.test(msg)) {
    return Object.assign(new Error(msg), { isNetwork: true });
  }
  return new Error(msg);
}

const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Broadcast de Realtime con límite de tiempo (best-effort, NUNCA cuelga).
async function broadcastAviso(event, payload) {
  try {
    const ch = supabase.channel("hoja-ruta");
    await Promise.race([
      new Promise((resolve) => ch.subscribe((s) => s === "SUBSCRIBED" && resolve())),
      timeout(2000),
    ]);
    await Promise.race([ch.send({ type: "broadcast", event, payload }), timeout(1500)]);
    await supabase.removeChannel(ch);
  } catch (_) {
    // best-effort
  }
}

// Invoca la Edge Function de push con límite de tiempo (best-effort).
async function pushAviso(body) {
  try {
    await Promise.race([supabase.functions.invoke("enviar-aviso", { body }), timeout(3000)]);
  } catch (_) {
    // best-effort
  }
}

// ── Helpers CRUD genéricos (tablas simples: zonas, camiones) ─────────────────
async function listSimple(table, params, { orderBy = "id", ascending = true } = {}) {
  let q = supabase.from(table).select("*");
  const activa = params.get("activa"); // zonas/camiones activas
  if (activa != null) q = q.eq(table === "entregas_zonas" ? "activa" : "activo", activa === "true");
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    q = q.order(col, { ascending: dir !== "desc" });
  } else {
    q = q.order(orderBy, { ascending });
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function insertSimple(table, body) {
  const { data, error } = await supabase.from(table).insert(body || {}).select().single();
  if (error) throw error;
  return data;
}

async function byId(table, rawId, method, body, immutable = ["id", "created_at"]) {
  const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
  if (method === "GET") {
    const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }
  if (method === "PATCH") {
    const patch = { ...(body || {}) };
    for (const k of immutable) delete patch[k];
    const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  if (method === "DELETE") {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
  throw new Error(`Método no soportado: ${method}`);
}

// ── ENTREGAS ─────────────────────────────────────────────────────────────────
async function listEntregas(params) {
  let q = supabase.from("entregas").select(ENTREGA_SELECT);
  const fecha = params.get("fecha");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const camionId = params.get("camion_id");
  const zonaId = params.get("zona_id");
  const estado = params.get("estado");
  const texto = params.get("q");
  const order = params.get("order");
  const limit = params.get("limit");

  if (fecha) q = q.eq("fecha_entrega", fecha);
  if (desde) q = q.gte("fecha_entrega", desde);
  if (hasta) q = q.lte("fecha_entrega", hasta);
  if (camionId === "null") q = q.is("camion_id", null);
  else if (camionId) q = q.eq("camion_id", Number(camionId));
  if (zonaId) q = q.eq("zona_id", Number(zonaId));
  if (estado) q = q.eq("estado", estado);
  if (texto) {
    // Búsqueda por cliente o dirección. Sacamos caracteres que rompen el filtro or().
    const safe = texto.replace(/[,()%]/g, " ").trim();
    if (safe) q = q.or(`cliente.ilike.%${safe}%,direccion.ilike.%${safe}%`);
  }

  if (order === "reciente") {
    q = q.order("fecha_entrega", { ascending: false }).order("created_at", { ascending: false });
  } else {
    q = q.order("fecha_entrega", { ascending: true }).order("orden", { ascending: true });
  }
  if (limit) q = q.limit(Number(limit));

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function createEntrega(body) {
  const b = body || {};
  const insert = { ...b, created_by: me().id ?? null };
  // Columnas que la DB gestiona sola.
  delete insert.id;
  delete insert.tracking_token;
  delete insert.created_at;
  delete insert.updated_at;
  const { data, error } = await supabase.from("entregas").insert(insert).select(ENTREGA_SELECT).single();
  if (error) throw error;
  return data;
}

async function entregaById(rest, method, body) {
  const id = Number(rest);
  if (method === "GET") {
    const { data, error } = await supabase.from("entregas").select(ENTREGA_SELECT).eq("id", id).single();
    if (error) throw error;
    return data;
  }
  if (method === "PATCH") {
    const patch = { ...(body || {}), updated_at: new Date().toISOString() };
    for (const k of ["id", "created_at", "created_by", "tracking_token"]) delete patch[k];
    const { data, error } = await supabase.from("entregas").update(patch).eq("id", id).select(ENTREGA_SELECT).single();
    if (error) throw error;
    return data;
  }
  if (method === "DELETE") {
    const { error } = await supabase.from("entregas").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
  throw new Error(`Método no soportado: ${method}`);
}

// ── Router principal: imita las respuestas de un backend REST ────────────────
export async function request(path, method = "GET", body = null) {
  method = method.toUpperCase();
  const [rawPath, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");

  try {
    // ── Seguimiento PÚBLICO (anon): RPC que expone sólo datos no sensibles ──
    if (rawPath.startsWith("/seguir/") && method === "GET") {
      const token = rawPath.slice("/seguir/".length);
      const { data, error } = await supabase.rpc("seguir_entrega", { p_token: token });
      if (error) throw error;
      // La función devuelve 0..1 filas; normalizamos a objeto|null.
      return Array.isArray(data) ? data[0] || null : data || null;
    }

    // ── Geocode: Edge Function 'geocode' (aún no desplegada) ──
    if (rawPath === "/geocode" && method === "POST") {
      const { data, error } = await supabase.functions.invoke("geocode", { body: body || {} });
      if (error) throw error;
      return data;
    }

    // ── ZONAS ──
    if (rawPath === "/zonas") {
      if (method === "GET") return await listSimple("entregas_zonas", params, { orderBy: "orden" });
      if (method === "POST") return await insertSimple("entregas_zonas", body);
    }
    if (rawPath.startsWith("/zonas/")) return await byId("entregas_zonas", rawPath.slice("/zonas/".length), method, body);

    // ── CAMIONES ──
    if (rawPath === "/camiones") {
      if (method === "GET") return await listSimple("entregas_camiones", params, { orderBy: "id" });
      if (method === "POST") return await insertSimple("entregas_camiones", body);
    }
    if (rawPath.startsWith("/camiones/")) return await byId("entregas_camiones", rawPath.slice("/camiones/".length), method, body);

    // ── MEDIOS DE PAGO (catálogo editable, mismo patrón que zonas) ──
    if (rawPath === "/medios-pago") {
      if (method === "GET") return await listSimple("entregas_medios_pago", params, { orderBy: "orden" });
      if (method === "POST") return await insertSimple("entregas_medios_pago", body);
    }
    if (rawPath.startsWith("/medios-pago/")) return await byId("entregas_medios_pago", rawPath.slice("/medios-pago/".length), method, body);

    // ── UBICACIÓN DEL CAMIÓN (upsert; alimenta el realtime y /seguir) ──
    if (rawPath === "/ubicacion" && method === "POST") {
      const b = body || {};
      const row = { camion_id: b.camion_id, lat: b.lat, lng: b.lng, updated_at: new Date().toISOString() };
      const { data, error } = await supabase
        .from("entregas_camion_ubicacion")
        .upsert(row, { onConflict: "camion_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    // ── CONFIG (fila única id=1) ──
    if (rawPath === "/config") {
      if (method === "GET") {
        const { data, error } = await supabase.from("entregas_config").select("*").eq("id", 1).maybeSingle();
        if (error) throw error;
        return data;
      }
      if (method === "PATCH") {
        const patch = { ...(body || {}) };
        delete patch.id;
        const { data, error } = await supabase.from("entregas_config").update(patch).eq("id", 1).select().single();
        if (error) throw error;
        return data;
      }
    }

    // ── ENTREGAS ──
    if (rawPath === "/entregas") {
      if (method === "GET") return await listEntregas(params);
      if (method === "POST") return await createEntrega(body);
    }
    if (rawPath.startsWith("/entregas/")) return await entregaById(rawPath.slice("/entregas/".length), method, body);

    // ── EVENTOS (historial por entrega) ──
    if (rawPath === "/eventos") {
      if (method === "GET") {
        let q = supabase.from("entregas_eventos").select("*");
        const entregaId = params.get("entrega_id");
        const tipo = params.get("tipo"); // ej: 'dia_cerrado' para los cierres
        const order = params.get("order"); // 'reciente' ⇒ más nuevo primero
        const limit = params.get("limit");
        if (entregaId) q = q.eq("entrega_id", Number(entregaId));
        if (tipo) q = q.eq("tipo", tipo);
        q = q.order("created_at", { ascending: order !== "reciente" });
        if (limit) q = q.limit(Number(limit));
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      }
      if (method === "POST") {
        const b = body || {};
        const insert = { entrega_id: b.entrega_id, tipo: b.tipo, detalle: b.detalle || null, user_id: me().id ?? null };
        const { data, error } = await supabase.from("entregas_eventos").insert(insert).select().single();
        if (error) throw error;
        return data;
      }
    }
    // Borrar un evento por id (ej: un resumen de cierre de día). El permiso
    // (sólo admin) se controla en la UI; la RLS lo refuerza en la base.
    if (rawPath.startsWith("/eventos/") && method === "DELETE") {
      const id = rawPath.slice("/eventos/".length);
      const { error } = await supabase.from("entregas_eventos").delete().eq("id", Number(id));
      if (error) throw error;
      return { ok: true };
    }

    // ── HOJA DE RUTA: publicar ──
    // Marca la hoja como lista (evento durable) y avisa en vivo a los repartidores
    // del camión vía broadcast de Realtime. El push con la app cerrada requiere una
    // Edge Function (pendiente); esto notifica a quien la tenga abierta.
    if (rawPath === "/hoja/publicar" && method === "POST") {
      const b = body || {};
      const detalle =
        b.detalle ||
        `camión ${b.camion_id ?? "—"} · ${b.fecha ?? ""} · ${b.cantidad ?? 0} paradas`;
      const { data, error } = await supabase
        .from("entregas_eventos")
        .insert({ entrega_id: null, tipo: "hoja_publicada", detalle, user_id: me().id ?? null })
        .select()
        .single();
      if (error) throw error;
      const camionTxt = b.camion_nombre || (b.camion_id ? `Camión ${b.camion_id}` : "El camión");
      await broadcastAviso("HOJA_PUBLICADA", {
        camion_id: b.camion_id ?? null,
        camion_nombre: b.camion_nombre ?? null,
        fecha: b.fecha ?? null,
        cantidad: b.cantidad ?? 0,
      });
      await pushAviso({
        title: "🚚 Camión listo para salir",
        body: `${camionTxt} está apto para salir · ${b.cantidad ?? 0} entregas`,
        url: "/reparto",
        tag: "hoja",
      });
      return data;
    }

    // ── GEOCODE LOG: diagnóstico del servicio de mapas ──
    if (rawPath === "/geocode-log" && method === "GET") {
      const desde = params.get("desde");
      let q = supabase
        .from("entregas_geocode_log")
        .select("resultado, detalle, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (desde) q = q.gte("created_at", desde);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }

    // ── CIERRE DEL DÍA: notifica al jefe con el resumen ──
    // Evento durable + broadcast en vivo (mismo criterio que /hoja/publicar).
    if (rawPath === "/dia/cerrar" && method === "POST") {
      const b = body || {};
      const detalle = b.detalle || `día ${b.fecha ?? ""} cerrado`;
      const { data, error } = await supabase
        .from("entregas_eventos")
        .insert({ entrega_id: null, tipo: "dia_cerrado", detalle, user_id: me().id ?? null })
        .select()
        .single();
      if (error) throw error;
      await broadcastAviso("DIA_CERRADO", { fecha: b.fecha ?? null, resumen: b.resumen ?? null });
      await pushAviso({
        title: "Se cerró el día",
        body: b.fecha ? `Resumen del ${b.fecha}` : "Resumen disponible",
        url: "/reparto/resumen",
        tag: "dia",
      });
      return data;
    }

    throw new Error(`Ruta no soportada: ${method} ${rawPath}`);
  } catch (error) {
    throw wrapError(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  Realtime shim: misma interfaz que socket.io (connect/disconnect/on/off) pero
//  por debajo Supabase Realtime. Emite ENTREGA_CREATED/UPDATED/DELETED (ya
//  enriquecidas con zona/camión) y CAMION_UBICACION, como los espera la UI.
//
//  NOTA: las tablas deben estar en la publicación de Realtime, ej:
//    alter publication supabase_realtime add table entregas, entregas_camion_ubicacion;
// ══════════════════════════════════════════════════════════════════════════
const listeners = {
  ENTREGA_CREATED: new Set(),
  ENTREGA_UPDATED: new Set(),
  ENTREGA_DELETED: new Set(),
  CAMION_UBICACION: new Set(),
  HOJA_PUBLICADA: new Set(),
  DIA_CERRADO: new Set(),
};
let channel = null;
let hojaChannel = null;

function emit(event, payload) {
  for (const cb of listeners[event] || []) {
    try {
      cb(payload);
    } catch (e) {
      console.error("[realtime]", e);
    }
  }
}

async function enrichedEntregaById(id) {
  const { data } = await supabase.from("entregas").select(ENTREGA_SELECT).eq("id", id).maybeSingle();
  return data;
}

export const socket = {
  connect() {
    if (channel) return;
    channel = supabase
      .channel("entregas-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "entregas" },
        async ({ new: row }) => emit("ENTREGA_CREATED", (await enrichedEntregaById(row.id)) || row))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "entregas" },
        async ({ new: row }) => emit("ENTREGA_UPDATED", (await enrichedEntregaById(row.id)) || row))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "entregas" },
        ({ old: row }) => emit("ENTREGA_DELETED", { id: row.id }))
      .on("postgres_changes", { event: "*", schema: "public", table: "entregas_camion_ubicacion" },
        ({ new: row, old }) => { const r = row || old; if (r) emit("CAMION_UBICACION", r); })
      .subscribe();

    // Canal de broadcast para el aviso "hoja publicada" (en vivo).
    hojaChannel = supabase
      .channel("hoja-ruta")
      .on("broadcast", { event: "HOJA_PUBLICADA" }, ({ payload }) => emit("HOJA_PUBLICADA", payload))
      .on("broadcast", { event: "DIA_CERRADO" }, ({ payload }) => emit("DIA_CERRADO", payload))
      .subscribe();
  },
  disconnect() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    if (hojaChannel) {
      supabase.removeChannel(hojaChannel);
      hojaChannel = null;
    }
  },
  on(event, cb) {
    (listeners[event] = listeners[event] || new Set()).add(cb);
  },
  off(event, cb) {
    listeners[event]?.delete(cb);
  },
};
