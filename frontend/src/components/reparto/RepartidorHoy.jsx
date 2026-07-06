import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Truck, Radio, Power, PackagePlus, RefreshCw } from "lucide-react";
import { api, socket } from "../../utils/api";
import { startTracking, stopTracking, isTracking } from "../../utils/tracking";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { EntregaCard } from "./EntregaCard";
import { EntregaForm } from "./EntregaForm";

const hoy = () => format(new Date(), "yyyy-MM-dd");
const CAMION_KEY = "mg_reparto_camion_hoy";
const sortByOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id);

function readCamionHoy() {
  try {
    const raw = JSON.parse(localStorage.getItem(CAMION_KEY) || "null");
    return raw && raw.fecha === hoy() ? String(raw.camionId) : "";
  } catch {
    return "";
  }
}

/**
 * RepartidorHoy — home operativo del repartidor: elige su camión de hoy y trabaja
 * la hoja publicada como tarjetas. Consume realtime con fallos defensivos.
 */
export function RepartidorHoy() {
  const fecha = hoy();
  const [camiones, setCamiones] = useState([]);
  const [camionHoy, setCamionHoy] = useState(readCamionHoy);
  const [pick, setPick] = useState(""); // selección temporal antes de "Empezar"
  const [config, setConfig] = useState(null);

  const [entregas, setEntregas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(isTracking());
  const [geoMsg, setGeoMsg] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  // Catálogos.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([api("/camiones"), api("/config")]).then(([c, cfg]) => {
      if (!alive) return;
      if (c.status === "fulfilled") setCamiones((c.value || []).filter((x) => x?.activo));
      if (cfg.status === "fulfilled") setConfig(cfg.value || null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const cargar = useMemo(
    () => () => {
      if (!camionHoy) return;
      setLoading(true);
      setError("");
      api(`/entregas?fecha=${fecha}&camion_id=${camionHoy}`)
        .then((data) => setEntregas((data || []).slice().sort(sortByOrden)))
        .catch(() => setError("No se pudieron cargar las entregas"))
        .finally(() => setLoading(false));
    },
    [camionHoy, fecha]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Realtime: mantener la lista al día (defensivo con optional chaining).
  useEffect(() => {
    if (!camionHoy) return;

    const upsert = (e) => {
      if (!e?.id) return;
      const esDeHoy = e?.fecha_entrega === fecha && Number(e?.camion_id) === Number(camionHoy);
      setEntregas((prev) => {
        const existe = prev.some((x) => Number(x?.id) === Number(e.id));
        if (existe) {
          // Si dejó de pertenecer a esta hoja (reprogramada/cambió de camión), sacarla.
          if (!esDeHoy) return prev.filter((x) => Number(x?.id) !== Number(e.id));
          return prev.map((x) => (Number(x?.id) === Number(e.id) ? { ...x, ...e } : x)).sort(sortByOrden);
        }
        return esDeHoy ? [...prev, e].sort(sortByOrden) : prev;
      });
    };
    const remove = (p) => {
      const id = p?.id;
      if (id == null) return;
      setEntregas((prev) => prev.filter((x) => Number(x?.id) !== Number(id)));
    };

    socket.on("ENTREGA_UPDATED", upsert);
    socket.on("ENTREGA_CREATED", upsert);
    socket.on("ENTREGA_DELETED", remove);
    return () => {
      socket.off("ENTREGA_UPDATED", upsert);
      socket.off("ENTREGA_CREATED", upsert);
      socket.off("ENTREGA_DELETED", remove);
    };
  }, [camionHoy, fecha]);

  function elegirCamion(id) {
    if (!id) return;
    setCamionHoy(String(id));
    try {
      localStorage.setItem(CAMION_KEY, JSON.stringify({ fecha, camionId: String(id) }));
    } catch {
      // no crítico
    }
  }

  function iniciarTracking() {
    setGeoMsg("");
    const ok = startTracking(
      camionHoy,
      () => setTracking(true),
      (err) => {
        setTracking(isTracking());
        setGeoMsg(
          err === "sin_geolocalizacion"
            ? "Este dispositivo no tiene geolocalización."
            : "No pudimos acceder a la ubicación. Revisá los permisos."
        );
      }
    );
    if (ok) setTracking(true);
  }

  function cerrarDia() {
    stopTracking();
    setTracking(false);
    setCamionHoy("");
    setPick("");
    try {
      localStorage.removeItem(CAMION_KEY);
    } catch {
      // no crítico
    }
  }

  const mergeLocal = (updated) =>
    setEntregas((prev) =>
      prev.map((x) => (Number(x?.id) === Number(updated?.id) ? { ...x, ...updated } : x)).sort(sortByOrden)
    );

  const camionActual = camiones.find((c) => Number(c?.id) === Number(camionHoy));

  // ── Selección de camión del día ──
  if (!camionHoy) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
            <Truck className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Tu camión de hoy</p>
        </div>
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Elegí un camión</option>
          {camiones.map((c) => (
            <option key={c.id} value={c.id}>
              {c?.nombre}
              {c?.patente ? ` (${c.patente})` : ""}
            </option>
          ))}
        </Select>
        <Button className="mt-3 w-full" onClick={() => elegirCamion(pick)} disabled={!pick}>
          Empezar el día
        </Button>
        {camiones.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            No hay camiones activos. Pedí que creen uno en la pestaña Camiones.
          </p>
        )}
      </div>
    );
  }

  // ── Home operativo ──
  return (
    <div className="flex flex-col gap-4">
      {/* Barra de camión + estado de seguimiento */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
          <Truck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
            {camionActual?.nombre || "Camión"}
          </p>
          <p className="flex items-center gap-1 text-xs">
            {tracking ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Radio className="h-3 w-3 animate-pulse" /> Publicando ubicación
              </span>
            ) : (
              <span className="text-slate-400">Seguimiento detenido</span>
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={cerrarDia}>
          <Power className="h-4 w-4" />
          Cerrar día
        </Button>
      </div>

      {geoMsg && <p className="text-sm text-amber-600 dark:text-amber-400">{geoMsg}</p>}

      {/* Acciones */}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setFormOpen(true)}>
          <PackagePlus className="h-4 w-4" />
          Entrega de último momento
        </Button>
        <Button variant="ghost" size="sm" onClick={cargar} aria-label="Refrescar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Tarjetas */}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando tu hoja…</p>
      ) : entregas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No hay entregas para hoy en este camión.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entregas.map((e) => (
            <EntregaCard
              key={e.id}
              entrega={e}
              config={config}
              onChanged={mergeLocal}
              onStartTracking={iniciarTracking}
            />
          ))}
        </div>
      )}

      <EntregaForm
        open={formOpen}
        fechaDefault={fecha}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          cargar();
        }}
      />
    </div>
  );
}

export default RepartidorHoy;
