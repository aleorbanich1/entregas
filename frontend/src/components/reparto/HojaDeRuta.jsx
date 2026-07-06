import { useCallback, useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  Wand2,
  Save,
  Send,
  ExternalLink,
  GripVertical,
  MapPinOff,
  CheckCircle2,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { api } from "../../utils/api";
import { planRoute, buildGoogleMapsLinks, routeDistanceKm } from "../../utils/ruta";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { CalendarPicker } from "../ui/CalendarPicker";
import { EntregaForm } from "./EntregaForm";
import { cn } from "../../utils/cn";

const parseDia = (d) => new Date(`${d}T12:00:00`);
const fmtDia = (d) =>
  parseDia(d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const hasCoords = (e) => e.lat != null && e.lng != null;
const zonaNombre = (e) => e?.zona?.nombre || "Sin zona";
const sortByOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id);

/**
 * HojaDeRuta — arma el recorrido por camión y fecha (default mañana): agrupa por
 * zona, calcula el orden (vecino-más-cercano + 2-opt desde el origen del local),
 * permite reordenar a mano (drag) y recalcular, abrir en Google Maps y publicar.
 * Todo por api()/transport (encolable offline).
 */
export function HojaDeRuta({ fechaDefault }) {
  const [fecha, setFecha] = useState(fechaDefault);
  const [showCal, setShowCal] = useState(false);
  const [camiones, setCamiones] = useState([]);
  const [camionId, setCamionId] = useState("");
  const [origin, setOrigin] = useState(null);

  const [raw, setRaw] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null); // entrega en edición (o null)

  // Catálogos: camiones + origen del local (una vez).
  useEffect(() => {
    let alive = true;
    Promise.allSettled([api("/camiones"), api("/config")]).then(([c, cfg]) => {
      if (!alive) return;
      if (c.status === "fulfilled") {
        const activos = (c.value || []).filter((x) => x.activo);
        setCamiones(activos);
        setCamionId((prev) => prev || (activos[0] ? String(activos[0].id) : ""));
      }
      if (cfg.status === "fulfilled" && cfg.value?.origen_lat != null) {
        setOrigin({ lat: Number(cfg.value.origen_lat), lng: Number(cfg.value.origen_lng) });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Entregas de la fecha elegida.
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    return api(`/entregas?fecha=${fecha}`)
      .then((data) => setRaw(data || []))
      .catch(() => setError("No se pudieron cargar las entregas"))
      .finally(() => setLoading(false));
  }, [fecha]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Filtrado por camión (o "sin camión") + orden guardado.
  const filtradas = useMemo(() => {
    const f = raw.filter((e) =>
      camionId === "" ? e.camion_id == null : Number(e.camion_id) === Number(camionId)
    );
    return [...f].sort(sortByOrden);
  }, [raw, camionId]);

  useEffect(() => {
    setItems(filtradas);
    setDirty(false);
    setMsg("");
  }, [filtradas]);

  function recalcular() {
    const ordered = planRoute(origin, items);
    setItems(ordered);
    setDirty(true);
    setMsg("");
  }

  async function guardarOrden(list = items) {
    setSaving(true);
    setError("");
    try {
      const cambios = list
        .map((e, i) => ({ id: e.id, orden: i, prev: e.orden ?? 0 }))
        .filter((c) => c.prev !== c.orden && /^\d+$/.test(String(c.id)));
      await Promise.all(
        cambios.map((c) => api(`/entregas/${c.id}`, { method: "PATCH", body: { orden: c.orden } }))
      );
      // Reflejar el nuevo orden en el estado local.
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
    setPublishing(true);
    setError("");
    setMsg("");
    try {
      if (dirty) {
        const ok = await guardarOrden();
        if (!ok) return;
      }
      await api("/hoja/publicar", {
        method: "POST",
        body: {
          camion_id: camionId ? Number(camionId) : null,
          fecha,
          cantidad: items.length,
        },
      });
      setMsg("Hoja publicada. Se avisó a los repartidores del camión.");
    } catch (e) {
      setError(e?.message || "No se pudo publicar la hoja");
    } finally {
      setPublishing(false);
    }
  }

  const links = useMemo(() => buildGoogleMapsLinks(origin, items), [origin, items]);
  const distancia = useMemo(() => routeDistanceKm(origin, items), [origin, items]);
  const sinCoords = items.filter((e) => !hasCoords(e)).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Selectores */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="mb-1 ml-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Camión
        </label>
        <Select value={camionId} onChange={(e) => setCamionId(e.target.value)}>
          <option value="">— Sin camión —</option>
          {camiones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.patente ? ` (${c.patente})` : ""}
            </option>
          ))}
        </Select>

        <label className="mb-1 ml-1 mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Fecha
        </label>
        <button
          type="button"
          onClick={() => setShowCal((v) => !v)}
          className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm capitalize text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        >
          {fmtDia(fecha)}
          <span className="text-xs text-slate-400">{showCal ? "Cerrar" : "Cambiar"}</span>
        </button>
        {showCal && (
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

      {/* Resumen + acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {items.length} paradas
        </span>
        {distancia > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            ~{distancia.toFixed(1)} km
          </span>
        )}
        {sinCoords > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <MapPinOff className="h-3 w-3" />
            {sinCoords} sin ubicación
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={recalcular} disabled={loading || !items.length}>
          <Wand2 className="h-4 w-4" />
          Recalcular
        </Button>
        <Button className="flex-1" onClick={() => guardarOrden()} disabled={!dirty || saving}>
          <Save className="h-4 w-4" />
          {saving ? "Guardando…" : "Guardar orden"}
        </Button>
      </div>

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

      {/* Lista ordenable con encabezados por zona */}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando entregas…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No hay entregas para esta fecha y camión.
        </p>
      ) : (
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
            />
          ))}
        </Reorder.Group>
      )}

      {/* Google Maps */}
      {links.length > 0 && (
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
              <p className="text-xs text-slate-500">
                {links.length} tramos (Google Maps admite hasta 9 paradas por link):
              </p>
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

      {/* Publicar */}
      <Button onClick={publicar} disabled={publishing || !items.length} className="mt-1">
        <Send className="h-4 w-4" />
        {publishing ? "Publicando…" : "Publicar hoja de ruta"}
      </Button>

      {/* Editar entrega */}
      <EntregaForm
        open={editando != null}
        entrega={editando}
        fechaDefault={fecha}
        onClose={() => setEditando(null)}
        onCreated={() => {
          setEditando(null);
          reload();
        }}
      />
    </div>
  );
}

// Fila arrastrable (framer-motion Reorder.Item, hijo directo del Group) con handle
// propio y, si la zona cambia respecto de la fila anterior, un encabezado de zona.
function RutaItem({ entrega, index, showZona, zona, onEditar }) {
  const controls = useDragControls();
  const sinUbi = !hasCoords(entrega);
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
      </div>
    </Reorder.Item>
  );
}

export default HojaDeRuta;
