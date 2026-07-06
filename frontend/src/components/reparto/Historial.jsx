import { useEffect, useState } from "react";
import { Search, ChevronDown, ChevronUp, X, MapPin, Phone, Pencil } from "lucide-react";
import { api } from "../../utils/api";
import { fmtARS, fmtFecha, fmtFechaHora } from "../../utils/format";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { EntregaForm } from "./EntregaForm";
import { cn } from "../../utils/cn";

const ESTADOS = [
  { id: "", label: "Todos los estados" },
  { id: "pendiente", label: "Pendiente" },
  { id: "en_camino", label: "En camino" },
  { id: "entregado", label: "Entregado" },
  { id: "no_entregado", label: "No entregado" },
  { id: "reprogramado", label: "Reprogramado" },
];
const ESTADO_CLS = {
  pendiente: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  en_camino: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
  entregado: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400",
  no_entregado: "bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400",
  reprogramado: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
};
const estadoLabel = (e) => ESTADOS.find((x) => x.id === e)?.label || e || "—";

/** Historial buscable por fecha, cliente, zona o estado. Lee entregas + eventos. */
export function Historial() {
  const [q, setQ] = useState("");
  const [fecha, setFecha] = useState("");
  const [zonaId, setZonaId] = useState("");
  const [estado, setEstado] = useState("");
  const [zonas, setZonas] = useState([]);

  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [buscado, setBuscado] = useState(false);
  const [editando, setEditando] = useState(null); // entrega en edición (o null)

  useEffect(() => {
    let alive = true;
    api("/zonas")
      .then((z) => alive && setZonas(z || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function buscar() {
    setLoading(true);
    setError("");
    setBuscado(true);
    try {
      const params = new URLSearchParams();
      if (fecha) params.set("fecha", fecha);
      if (zonaId) params.set("zona_id", zonaId);
      if (estado) params.set("estado", estado);
      if (q.trim()) params.set("q", q.trim());
      params.set("order", "reciente");
      params.set("limit", "100");
      const data = await api(`/entregas?${params.toString()}`);
      setResultados(data || []);
    } catch (e) {
      setError(e?.message || "No se pudo buscar");
    } finally {
      setLoading(false);
    }
  }

  function limpiar() {
    setQ("");
    setFecha("");
    setZonaId("");
    setEstado("");
    setResultados([]);
    setBuscado(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Historial</h2>

      {/* Filtros */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Cliente o dirección…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
            />
          </div>
          <Button onClick={buscar} disabled={loading} className="min-h-[52px] px-4">
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z?.nombre}
              </option>
            ))}
          </Select>
          <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={buscar} disabled={loading} className="flex-1">
            {loading ? "Buscando…" : "Buscar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={limpiar} aria-label="Limpiar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Resultados */}
      {!buscado ? (
        <p className="py-4 text-center text-sm text-slate-500">
          Buscá por cliente, fecha, zona o estado.
        </p>
      ) : loading ? (
        <p className="py-4 text-center text-sm text-slate-500">Buscando…</p>
      ) : resultados.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Sin resultados.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {resultados.map((e) => (
            <FilaHistorial key={e.id} entrega={e} onEditar={() => setEditando(e)} />
          ))}
        </div>
      )}

      {/* Editar entrega */}
      <EntregaForm
        open={editando != null}
        entrega={editando}
        fechaDefault={editando?.fecha_entrega || fecha}
        onClose={() => setEditando(null)}
        onCreated={() => {
          setEditando(null);
          buscar();
        }}
      />
    </div>
  );
}

function FilaHistorial({ entrega, onEditar }) {
  const [open, setOpen] = useState(false);
  const [eventos, setEventos] = useState(null);
  const [loadingEv, setLoadingEv] = useState(false);
  const estado = entrega?.estado || "pendiente";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && eventos == null) {
      setLoadingEv(true);
      try {
        const ev = await api(`/eventos?entrega_id=${entrega.id}`);
        setEventos(ev || []);
      } catch {
        setEventos([]);
      } finally {
        setLoadingEv(false);
      }
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button onClick={toggle} className="flex w-full items-center gap-2 px-3 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
              {entrega?.cliente || "Sin nombre"}
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", ESTADO_CLS[estado])}>
              {estadoLabel(estado)}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">
            {fmtFecha(entrega?.fecha_entrega)} · {entrega?.zona?.nombre || "Sin zona"}
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          <p className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            {entrega?.direccion || "Sin dirección"}
          </p>
          {entrega?.telefono && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              {entrega.telefono}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {entrega?.pagado ? "Pagado" : "A cobrar"} · {fmtARS(entrega?.monto)}
            </span>
            {entrega?.franja && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {entrega.franja}
                {entrega?.hora_aprox ? ` · ${String(entrega.hora_aprox).slice(0, 5)}` : ""}
              </span>
            )}
          </div>
          {entrega?.motivo_no_entregado && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Motivo: {entrega.motivo_no_entregado}
            </p>
          )}
          {entrega?.productos && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{entrega.productos}</p>
          )}

          {/* Eventos */}
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Movimientos
            </p>
            {loadingEv ? (
              <p className="text-xs text-slate-500">Cargando…</p>
            ) : !eventos || eventos.length === 0 ? (
              <p className="text-xs text-slate-500">Sin movimientos registrados.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {eventos.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="text-slate-600 dark:text-slate-300">
                      <span className="font-medium capitalize">
                        {String(ev?.tipo || "").replace(/_/g, " ")}
                      </span>
                      {ev?.detalle ? ` — ${ev.detalle}` : ""}
                      <span className="ml-1 text-slate-400">{fmtFechaHora(ev?.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button variant="secondary" size="sm" onClick={onEditar} className="mt-3">
            <Pencil className="h-4 w-4" />
            Editar entrega
          </Button>
        </div>
      )}
    </div>
  );
}

export default Historial;
