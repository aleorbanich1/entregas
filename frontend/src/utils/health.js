import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, pendingCount } from "./api";
import { notificationStatus } from "./reminders";
import { APP_VERSION } from "./config";

/**
 * health.js — auto-diagnóstico para un cliente NO técnico. Semáforos en castellano.
 * Es SÓLO informativo: todo va en try/catch y ante cualquier duda queda en verde.
 * La app NUNCA se bloquea por esto.
 */
const HealthContext = createContext(null);

export const NIVEL = { verde: "verde", amarillo: "amarillo", rojo: "rojo" };
export const NIVEL_TEXTO = {
  verde: "Todo bien",
  amarillo: "Necesita atención",
  rojo: "Con problemas",
};

const peor = (a, b) => {
  const rank = { verde: 0, amarillo: 1, rojo: 2 };
  return rank[b] > rank[a] ? b : a;
};

// Evalúa el log de geocode (últimos 7 días).
function evalMapas(rows, umbral) {
  const counts = { ok: 0, no_encontrada: 0, bloqueado: 0, error: 0 };
  let ultimoBloqueo = null;
  for (const r of rows || []) {
    const res = r?.resultado;
    if (res in counts) counts[res]++;
    if (res === "bloqueado") {
      if (!ultimoBloqueo || new Date(r?.created_at) > new Date(ultimoBloqueo)) {
        ultimoBloqueo = r?.created_at || null;
      }
    }
  }
  const total = (rows || []).length;
  const bloqueos = counts.bloqueado;
  const fallos = counts.error;
  const ratioPct = total ? Math.round(((fallos + bloqueos) / total) * 100) : 0;
  let status = NIVEL.verde;
  if (bloqueos > 0 || ratioPct > umbral) status = NIVEL.rojo;
  else if (fallos > 0) status = NIVEL.amarillo;
  return { status, counts, total, bloqueos, fallos, ratioPct, umbral, ultimoBloqueo };
}

function buildChecks({ online, pending, notif, mapas }) {
  // Conexión
  let conexion;
  if (!online) {
    conexion = {
      id: "conexion",
      label: "Conexión",
      status: NIVEL.amarillo,
      resumen: "Sin conexión",
      mensaje:
        "No hay internet en este momento. La app funciona igual y sincroniza sola cuando vuelva la conexión.",
    };
  } else if (pending > 0) {
    conexion = {
      id: "conexion",
      label: "Conexión",
      status: NIVEL.amarillo,
      resumen: `${pending} cambio(s) sin sincronizar`,
      mensaje: `Hay ${pending} cambio(s) esperando subir. Se sincronizan solos apenas haya buena señal.`,
    };
  } else {
    conexion = { id: "conexion", label: "Conexión", status: NIVEL.verde, resumen: "Conectado", mensaje: "" };
  }

  // Mapas
  let mapasCheck;
  if (mapas.status === NIVEL.rojo) {
    mapasCheck = {
      id: "mapas",
      label: "Mapas",
      status: NIVEL.rojo,
      resumen: "El servicio de mapas viene fallando",
      mensaje:
        "El servicio de mapas gratuito viene fallando. La app sigue funcionando (podés ubicar direcciones a mano), pero conviene mejorarlo.",
    };
  } else if (mapas.status === NIVEL.amarillo) {
    mapasCheck = {
      id: "mapas",
      label: "Mapas",
      status: NIVEL.amarillo,
      resumen: "Algunas direcciones no se ubican",
      mensaje:
        "Algunas direcciones no se pudieron ubicar en el mapa. Podés marcarlas a mano; no es urgente.",
    };
  } else {
    mapasCheck = { id: "mapas", label: "Mapas", status: NIVEL.verde, resumen: "Funcionando", mensaje: "" };
  }

  // Notificaciones
  let notifCheck;
  if (notif === "granted") {
    notifCheck = { id: "notif", label: "Notificaciones", status: NIVEL.verde, resumen: "Activas", mensaje: "" };
  } else if (notif === "unsupported" || notif === "unknown") {
    notifCheck = {
      id: "notif",
      label: "Notificaciones",
      status: NIVEL.verde,
      resumen: "No disponibles en este dispositivo",
      mensaje: "",
    };
  } else {
    notifCheck = {
      id: "notif",
      label: "Notificaciones",
      status: NIVEL.amarillo,
      resumen: notif === "denied" ? "Bloqueadas" : "No activadas",
      mensaje:
        "Las notificaciones no están activas. Activálas para enterarte de las hojas de ruta y avisos.",
    };
  }

  return [conexion, mapasCheck, notifCheck];
}

export function buildDiagnostic({ online, pending, notif, mapas }) {
  const c = mapas?.counts || {};
  const lines = [
    "MG Reparto — diagnóstico",
    `Versión: ${APP_VERSION}`,
    `Fecha: ${new Date().toLocaleString("es-AR")}`,
    `Conexión: ${online ? "online" : "offline"}${pending ? `, ${pending} en cola` : ""}`,
    `Notificaciones: ${notif}`,
    `Mapas (7 días): ok:${c.ok || 0} no_encontrada:${c.no_encontrada || 0} bloqueado:${
      c.bloqueado || 0
    } error:${c.error || 0} (total ${mapas?.total || 0}, ${mapas?.ratioPct || 0}% fallo, umbral ${
      mapas?.umbral ?? 20
    }%)`,
  ];
  if (mapas?.ultimoBloqueo) {
    lines.push(`Último bloqueo: ${new Date(mapas.ultimoBloqueo).toLocaleString("es-AR")}`);
  }
  return lines.join("\n");
}

const MAPAS_DEFAULT = {
  status: NIVEL.verde,
  counts: {},
  total: 0,
  bloqueos: 0,
  fallos: 0,
  ratioPct: 0,
  umbral: 20,
  ultimoBloqueo: null,
};

export function HealthProvider({ enabled, children }) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [notif, setNotif] = useState("unknown");
  const [mapas, setMapas] = useState(MAPAS_DEFAULT);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      const n = await pendingCount();
      if (alive) setPending(n);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled, online]);

  useEffect(() => {
    if (!enabled) return;
    notificationStatus()
      .then(setNotif)
      .catch(() => setNotif("unsupported"));
  }, [enabled]);

  const refresh = useCallback(async () => {
    try {
      const desde = new Date(Date.now() - 7 * 864e5).toISOString();
      const [rows, cfg] = await Promise.all([api(`/geocode-log?desde=${desde}`), api("/config")]);
      const umbral = Number(cfg?.umbral_fallo_pct ?? 20);
      setMapas(evalMapas(rows || [], umbral));
      setConfig(cfg || null);
    } catch {
      // Nunca bloquear: si falla el diagnóstico, quedamos en verde.
      setMapas(MAPAS_DEFAULT);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, 300000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const checks = useMemo(
    () => (enabled ? buildChecks({ online, pending, notif, mapas }) : []),
    [enabled, online, pending, notif, mapas]
  );
  const worst = useMemo(() => checks.reduce((acc, c) => peor(acc, c.status), NIVEL.verde), [checks]);
  const worstCheck = useMemo(
    () =>
      checks.find((c) => c.status === NIVEL.rojo) ||
      checks.find((c) => c.status === NIVEL.amarillo) ||
      null,
    [checks]
  );

  const value = useMemo(
    () => ({
      enabled,
      online,
      pending,
      notif,
      mapas,
      config,
      checks,
      worst,
      worstCheck,
      refresh,
      diagnostico: () => buildDiagnostic({ online, pending, notif, mapas }),
    }),
    [enabled, online, pending, notif, mapas, config, checks, worst, worstCheck, refresh]
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  return useContext(HealthContext) || { enabled: false, checks: [], worst: NIVEL.verde, worstCheck: null };
}
