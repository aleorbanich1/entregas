import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Clock, XCircle, CalendarClock, Truck, Power, CheckCheck } from "lucide-react";
import { api } from "../../utils/api";
import { fmtARS, fmtFecha } from "../../utils/format";
import { Button } from "../ui/Button";
import { CalendarPicker } from "../ui/CalendarPicker";
import { cn } from "../../utils/cn";

const hoy = () => format(new Date(), "yyyy-MM-dd");

function statsDe(list) {
  const s = {
    total: list.length,
    entregadas: 0,
    pendientes: 0,
    no_entregadas: 0,
    reprogramadas: 0,
    cobrado: 0, // entregado y NO pagado de antemano → cobrado en la entrega
    pagadoAntemano: 0, // entregado y ya pagado → informativo
    porCobrar: 0, // aún en curso, a cobrar
  };
  for (const e of list) {
    const est = e?.estado;
    const monto = Number(e?.monto || 0);
    if (est === "entregado") {
      s.entregadas++;
      if (e?.pagado) s.pagadoAntemano += monto;
      else s.cobrado += monto;
    } else if (est === "no_entregado") {
      s.no_entregadas++;
    } else if (est === "reprogramado") {
      s.reprogramadas++;
    } else {
      s.pendientes++; // pendiente / en_camino
      if (!e?.pagado) s.porCobrar += monto;
    }
  }
  return s;
}

/** Resumen del día: totales por camión y global + cierre del día. */
export function ResumenDia() {
  const [fecha, setFecha] = useState(hoy());
  const [showCal, setShowCal] = useState(false);
  const [entregas, setEntregas] = useState([]);
  const [camiones, setCamiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api("/camiones")
      .then((c) => alive && setCamiones(c || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setMsg("");
    api(`/entregas?fecha=${fecha}`)
      .then((d) => alive && setEntregas(d || []))
      .catch(() => alive && setError("No se pudieron cargar las entregas"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fecha]);

  const grupos = useMemo(() => {
    const byCam = new Map();
    for (const e of entregas) {
      const key = e?.camion_id == null ? "sin" : String(e.camion_id);
      if (!byCam.has(key)) byCam.set(key, []);
      byCam.get(key).push(e);
    }
    const nombre = (key) => {
      if (key === "sin") return "Sin camión";
      const c = camiones.find((x) => Number(x?.id) === Number(key));
      return c?.nombre || `Camión ${key}`;
    };
    return [...byCam.entries()]
      .map(([key, list]) => ({ key, nombre: nombre(key), stats: statsDe(list) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [entregas, camiones]);

  const global = useMemo(() => statsDe(entregas), [entregas]);

  async function cerrarDia() {
    setClosing(true);
    setError("");
    setMsg("");
    const detalle =
      `Cierre ${fmtFecha(fecha, { day: "numeric", month: "long", year: "numeric" })} — ` +
      `${global.entregadas} entregadas, ${global.pendientes} pendientes, ` +
      `${global.no_entregadas} no entregadas, ${global.reprogramadas} reprog. · ` +
      `Cobrado ${fmtARS(global.cobrado)} (ya pago ${fmtARS(global.pagadoAntemano)})`;
    try {
      await api("/dia/cerrar", { method: "POST", body: { fecha, detalle, resumen: global } });
      setMsg("Día cerrado. Se envió el resumen al jefe.");
    } catch (e) {
      setError(e?.message || "No se pudo cerrar el día");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Fecha */}
      <div>
        <button
          type="button"
          onClick={() => setShowCal((v) => !v)}
          className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm capitalize text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        >
          {fmtFecha(fecha, { weekday: "long", day: "numeric", month: "long" })}
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

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando resumen…</p>
      ) : (
        <>
          <TarjetaResumen titulo="Total del día" stats={global} destacado />
          {grupos.map((g) => (
            <TarjetaResumen key={g.key} titulo={g.nombre} icon={Truck} stats={g.stats} />
          ))}
          {entregas.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">
              No hay entregas para esta fecha.
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {msg && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
          <CheckCheck size={16} /> {msg}
        </p>
      )}

      <Button onClick={cerrarDia} disabled={closing || loading} className="mt-1">
        <Power className="h-4 w-4" />
        {closing ? "Cerrando…" : "Cerrar el día y avisar al jefe"}
      </Button>
    </div>
  );
}

function TarjetaResumen({ titulo, icon: Icon, stats, destacado }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900",
        destacado
          ? "border-emerald-200 dark:border-emerald-900/50"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        {Icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{titulo}</h3>
        <span className="ml-auto text-xs text-slate-400">{stats.total} entregas</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metrica icon={CheckCircle2} tone="emerald" label="Entregadas" value={stats.entregadas} />
        <Metrica icon={Clock} tone="slate" label="Pendientes" value={stats.pendientes} />
        <Metrica icon={XCircle} tone="red" label="No entregadas" value={stats.no_entregadas} />
        <Metrica icon={CalendarClock} tone="amber" label="Reprogramadas" value={stats.reprogramadas} />
      </div>

      <div className="mt-3 flex items-end justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
        <div>
          <p className="text-xs text-slate-500">Cobrado (en entrega)</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {fmtARS(stats.cobrado)}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Ya estaba pago: {fmtARS(stats.pagadoAntemano)}</p>
          <p>Por cobrar: {fmtARS(stats.porCobrar)}</p>
        </div>
      </div>
    </div>
  );
}

const TONES = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
  slate: "text-slate-500",
};

function Metrica({ icon: Icon, tone, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-2.5 py-2 dark:border-slate-800">
      <Icon className={cn("h-4 w-4 shrink-0", TONES[tone])} />
      <div className="min-w-0">
        <p className="text-base font-semibold leading-none text-slate-900 dark:text-slate-50">
          {value}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export default ResumenDia;
