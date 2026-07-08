import { useCallback, useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  Wand2,
  Save,
  BellRing,
  FileDown,
  ExternalLink,
  GripVertical,
  MapPinOff,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { api, socket } from "../../utils/api";
import { planRoute, buildGoogleMapsLinks, routeDistanceKm } from "../../utils/ruta";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { CalendarPicker } from "../ui/CalendarPicker";
import { useConfirm } from "../ui/Confirm";
import { EntregaForm } from "./EntregaForm";
import { PdfEtiquetas } from "./PdfEtiquetas";
import { cn } from "../../utils/cn";

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoy = () => ymd(new Date());
const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
};
const parseDia = (d) => new Date(`${d}T12:00:00`);
const fmtDia = (d) =>
  parseDia(d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const labelFecha = (d) => (d === hoy() ? "Hoy" : d === manana() ? "Mañana" : fmtDia(d));

const hasCoords = (e) => e.lat != null && e.lng != null;
const zonaNombre = (e) => e?.zona?.nombre || "Sin zona";
const sortByOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id);
const isReal = (id) => /^\d+$/.test(String(id));

const RUTA_KEY = "mg_reparto_ruta";
function readRuta() {
  try {
    return JSON.parse(localStorage.getItem(RUTA_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * HojaDeRuta — por defecto muestra TODAS las entregas (todos los camiones, todas
 * las fechas). Al elegir una fecha y un camión concretos se habilita el armado del
 * recorrido (ordenar por cercanía, reordenar a mano, Google Maps y publicar).
 * Se actualiza sola cuando se crean/cambian entregas (realtime).
 */
export function HojaDeRuta() {
  const saved = readRuta();
  const [camionId, setCamionId] = useState(saved.camionId ?? "todos");
  const [verTodas, setVerTodas] = useState(saved.verTodas ?? true);
  const [fecha, setFecha] = useState(saved.fecha || hoy());
  const [showCal, setShowCal] = useState(false);

  const [camiones, setCamiones] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [raw, setRaw] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null);
  const [showPdf, setShowPdf] = useState(false);
  const [confirm, confirmUI] = useConfirm();

  // Recordar la elección al cambiar de pestaña / recargar.
  useEffect(() => {
    try {
      localStorage.setItem(RUTA_KEY, JSON.stringify({ camionId, verTodas, fecha }));
    } catch {
      // no crítico
    }
  }, [camionId, verTodas, fecha]);

  // Catálogos: camiones + origen del local.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([api("/camiones"), api("/config")]).then(([c, cfg]) => {
      if (!alive) return;
      if (c.status === "fulfilled") setCamiones((c.value || []).filter((x) => x.activo));
      if (cfg.status === "fulfilled" && cfg.value?.origen_lat != null) {
        setOrigin({ lat: Number(cfg.value.origen_lat), lng: Number(cfg.value.origen_lng) });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Cargar entregas: todas (por defecto) o de una fecha puntual.
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    const q = verTodas ? "/entregas?order=reciente&limit=1000" : `/entregas?fecha=${fecha}`;
    return api(q)
      .then((data) => setRaw(data || []))
      .catch(() => setError("No se pudieron cargar las entregas"))
      .finally(() => setLoading(false));
  }, [verTodas, fecha]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime: que las entregas nuevas/cambiadas aparezcan solas.
  useEffect(() => {
    let t;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => reload(), 400);
    };
    socket.on("ENTREGA_CREATED", refresh);
    socket.on("ENTREGA_UPDATED", refresh);
    socket.on("ENTREGA_DELETED", refresh);
    return () => {
      clearTimeout(t);
      socket.off("ENTREGA_CREATED", refresh);
      socket.off("ENTREGA_UPDATED", refresh);
      socket.off("ENTREGA_DELETED", refresh);
    };
  }, [reload]);

  async function borrarEntrega(e) {
    if (!(await confirm(`¿Borrar la entrega de ${e?.cliente || "este cliente"}?`, {
      title: "Borrar entrega",
      confirmText: "Borrar",
    }))) return;
    setError("");
    const prev = raw;
    setRaw((cur) => cur.filter((x) => Number(x.id) !== Number(e.id)));
    if (!isReal(e.id)) return;
    try {
      await api(`/entregas/${e.id}`, { method: "DELETE" });
    } catch {
      setRaw(prev);
      setError("No se pudo borrar la entrega.");
    }
  }

  // Filtro por camión (y fecha si no es "todas").
  const filtradas = useMemo(() => {
    let f = raw;
    if (camionId === "") f = f.filter((e) => e.camion_id == null);
    else if (camionId !== "todos") f = f.filter((e) => Number(e.camion_id) === Number(camionId));
    if (!verTodas) f = f.filter((e) => e.fecha_entrega === fecha);
    return f;
  }, [raw, camionId, verTodas, fecha]);

  useEffect(() => {
    setItems([...filtradas].sort(sortByOrden));
    setDirty(false);
    setMsg("");
  }, [filtradas]);

  // ¿Se puede armar un recorrido? Sólo con una fecha y un camión concretos.
  const rutaEspecifica = !verTodas && camionId !== "todos";

  function recalcular() {
    setItems(planRoute(origin, items));
    setDirty(true);
    setMsg("");
  }

  async function guardarOrden(list = items) {
    setSaving(true);
    setError("");
    try {
      const cambios = list
        .map((e, i) => ({ id: e.id, orden: i, prev: e.orden ?? 0 }))
        .filter((c) => c.prev !== c.orden && isReal(c.id));
      await Promise.all(
        cambios.map((c) => api(`/entregas/${c.id}`, { method: "PATCH", body: { orden: c.orden } }))
      );
      setItems((prev) => prev.map((e, i) => ({ ...e, orden: i })));
      setDirty(false);
      return true;
    } catch (e) {
      setError(e?.message || "No se pudo guardar el orden");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publicar() {
    const camionNombre =
      camiones.find((c) => Number(c.id) === Number(camionId))?.nombre || null;

    // Confirmación clara antes de notificar a TODA la app.
    const ok = await confirm(
      <>
        ¿Ya cargaste <b>todas</b> las entregas para <b>{fmtDia(fecha)}</b>?
        <br />
        <br />
        Se enviará una notificación a <b>todas las personas dentro de la aplicación</b> de que este
        camión{camionNombre ? ` (${camionNombre})` : ""} está apto para salir.
      </>,
      {
        title: "Avisar a los repartidores",
        confirmText: "Sí, avisar a todos",
        danger: false,
      }
    );
    if (!ok) return;

    setPublishing(true);
    setError("");
    setMsg("");
    try {
      if (dirty) {
        const okOrden = await guardarOrden();
        if (!okOrden) return;
      }
      await api("/hoja/publicar", {
        method: "POST",
        body: {
          camion_id: camionId ? Number(camionId) : null,
          camion_nombre: camionNombre,
          fecha,
          cantidad: items.length,
        },
      });
      setMsg("¡Aviso enviado! Se notificó a todas las personas de la app que el camión está listo para salir.");
    } catch (e) {
      setError(e?.message || "No se pudo enviar el aviso");
    } finally {
      setPublishing(false);
    }
  }

  const links = useMemo(() => buildGoogleMapsLinks(origin, items), [origin, items]);
  const distancia = useMemo(() => routeDistanceKm(origin, items), [origin, items]);
  const sinCoords = items.filter((e) => !hasCoords(e)).length;

  // Para el modo "ver todas": agrupar por fecha.
  const porFecha = useMemo(() => {
    const map = new Map();
    for (const e of items) {
      const k = e.fecha_entrega || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // más reciente primero
  }, [items]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="mb-1 ml-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Camión
        </label>
        <Select value={camionId} onChange={(e) => setCamionId(e.target.value)}>
          <option value="todos">Todos los camiones</option>
          {camiones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.patente ? ` (${c.patente})` : ""}
            </option>
          ))}
          <option value="">Sin camión</option>
        </Select>

        <label className="mb-1 ml-1 mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Fecha
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setVerTodas(true);
              setShowCal(false);
            }}
            className={cn(
              "flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
              verTodas
                ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/25 dark:text-emerald-400"
                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => {
              setVerTodas(false);
              setShowCal((v) => !v);
            }}
            className={cn(
              "flex-1 truncate rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors",
              !verTodas
                ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/25 dark:text-emerald-400"
                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            {verTodas ? "Elegir fecha" : labelFecha(fecha)}
          </button>
        </div>
        {showCal && !verTodas && (
          <div className="mt-2">
            <CalendarPicker
              selectedDate={fecha}
              onSelectDate={(d) => {
                setFecha(d);
                setShowCal(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Resumen + refrescar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {items.length} entregas
        </span>
        {rutaEspecifica && distancia > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            ~{distancia.toFixed(1)} km
          </span>
        )}
        {rutaEspecifica && sinCoords > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <MapPinOff className="h-3 w-3" />
            {sinCoords} sin ubicación
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={reload} aria-label="Refrescar" className="ml-auto">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Descargar PDF de etiquetas (sobre las entregas que se están viendo) */}
      {items.length > 0 && (
        <Button variant="secondary" onClick={() => setShowPdf(true)}>
          <FileDown className="h-4 w-4" />
          Descargar PDF de etiquetas
        </Button>
      )}

      {/* Acciones de recorrido (sólo con fecha + camión concretos) */}
      {rutaEspecifica ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={recalcular} disabled={loading || !items.length}>
            <Wand2 className="h-4 w-4" />
            Ordenar por cercanía
          </Button>
          <Button className="flex-1" onClick={() => guardarOrden()} disabled={!dirty || saving}>
            <Save className="h-4 w-4" />
            {saving ? "Guardando…" : "Guardar orden"}
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Estás viendo todas las entregas. Para armar un recorrido (ordenar, Google Maps y publicar),
          elegí una <b>fecha</b> y un <b>camión</b>.
        </p>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} /> {error}
        </p>
      )}
      {msg && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
          <CheckCircle2 size={16} /> {msg}
        </p>
      )}

      {/* Lista */}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando entregas…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No hay entregas para mostrar.</p>
      ) : rutaEspecifica ? (
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={(next) => {
            setItems(next);
            setDirty(true);
          }}
          className="flex flex-col gap-2"
        >
          {items.map((e, i) => (
            <RutaItem
              key={e.id}
              entrega={e}
              index={i}
              showZona={i === 0 || zonaNombre(items[i - 1]) !== zonaNombre(e)}
              zona={zonaNombre(e)}
              onEditar={() => setEditando(e)}
              onBorrar={() => borrarEntrega(e)}
            />
          ))}
        </Reorder.Group>
      ) : (
        <div className="flex flex-col gap-3">
          {porFecha.map(([f, list]) => (
            <div key={f} className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {labelFecha(f)} · {list.length}
              </p>
              {list.map((e) => (
                <BrowseRow
                  key={e.id}
                  entrega={e}
                  onEditar={() => setEditando(e)}
                  onBorrar={() => borrarEntrega(e)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Google Maps + Publicar (sólo en modo recorrido) */}
      {rutaEspecifica && links.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {links.length === 1 ? (
            <a href={links[0]} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" className="w-full">
                <ExternalLink className="h-4 w-4" />
                Abrir ruta en Google Maps
              </Button>
            </a>
          ) : (
            <>
              <p className="text-xs text-slate-500">{links.length} tramos:</p>
              <div className="flex flex-wrap gap-2">
                {links.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">
                      <ExternalLink className="h-4 w-4" />
                      Tramo {idx + 1}
                    </Button>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {rutaEspecifica && (
        <div className="mt-1 flex flex-col gap-1">
          <Button onClick={publicar} disabled={publishing || !items.length}>
            <BellRing className="h-4 w-4" />
            {publishing ? "Avisando…" : "Avisar a repartidores"}
          </Button>
          <p className="px-1 text-xs text-slate-400">
            Avisa a <b>todas las personas de la app</b> (incluido vos) que este camión ya está listo
            para salir.
          </p>
        </div>
      )}

      <EntregaForm
        open={editando != null}
        entrega={editando}
        fechaDefault={editando?.fecha_entrega || (verTodas ? hoy() : fecha)}
        onClose={() => setEditando(null)}
        onCreated={() => {
          setEditando(null);
          reload();
        }}
      />

      <PdfEtiquetas open={showPdf} onClose={() => setShowPdf(false)} entregas={items} />

      {confirmUI}
    </div>
  );
}

// Fila del modo "ver todas" (sin drag).
function BrowseRow({ entrega, onEditar, onBorrar }) {
  const sinUbi = !hasCoords(entrega);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
          {entrega.cliente}
        </p>
        <p className="truncate text-xs text-slate-500">
          {zonaNombre(entrega)} · {entrega.direccion}
        </p>
      </div>
      {sinUbi && (
        <span title="Sin coordenadas">
          <MapPinOff className="h-4 w-4 shrink-0 text-amber-500" />
        </span>
      )}
      <button
        onClick={onEditar}
        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label="Editar"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onBorrar}
        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        aria-label="Borrar"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// Fila arrastrable (modo recorrido).
function RutaItem({ entrega, index, showZona, zona, onEditar, onBorrar }) {
  const controls = useDragControls();
  const sinUbi = !hasCoords(entrega);
  const entregado = entrega?.estado === "entregado";
  return (
    <Reorder.Item value={entrega} dragListener={false} dragControls={controls}>
      {showZona && (
        <p className="mb-1 mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {zona}
        </p>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 dark:bg-slate-900",
          sinUbi ? "border-amber-200 dark:border-amber-900/40" : "border-slate-200 dark:border-slate-800"
        )}
      >
        <button
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600"
          aria-label="Arrastrar"
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white dark:bg-emerald-500">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
            {entrega.cliente}
          </p>
          <p className="truncate text-xs text-slate-500">{entrega.direccion}</p>
        </div>

        {sinUbi && (
          <span title="Sin coordenadas">
            <MapPinOff className="h-4 w-4 shrink-0 text-amber-500" />
          </span>
        )}

        <button
          onClick={onEditar}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Editar entrega"
        >
          <Pencil className="h-4 w-4" />
        </button>
        {!entregado && (
          <button
            onClick={onBorrar}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            aria-label="Borrar entrega"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </Reorder.Item>
  );
}

export default HojaDeRuta;
