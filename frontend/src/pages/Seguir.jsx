import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { MapPin, Clock, Package, Truck, CheckCircle2, CalendarClock, AlertCircle } from "lucide-react";
import { api } from "../utils/api";
import { cn } from "../utils/cn";

// Leaflet sólo se descarga cuando hay posición del camión que mostrar.
const SeguirMapa = lazy(() => import("../components/reparto/SeguirMapa"));

const PASOS = [
  { id: "pendiente", label: "Preparando", icon: Package },
  { id: "en_camino", label: "En camino", icon: Truck },
  { id: "entregado", label: "Entregado", icon: CheckCircle2 },
];
const pasoIndex = (estado) => {
  if (estado === "entregado") return 2;
  if (estado === "en_camino") return 1;
  return 0; // pendiente / reprogramado / otros
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function haceCuanto(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return "";
  const min = Math.round(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}

export default function Seguir() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await api(`/seguir/${token}`);
        if (!alive) return;
        setData(res || null);
        setError(false);
        setLoaded(true);

        // Re-poll: ~30s en camino, ~60s si sigue en curso, y frenar si terminó.
        const estado = res?.estado;
        clearTimeout(timerRef.current);
        if (res && estado !== "entregado" && estado !== "no_entregado") {
          timerRef.current = setTimeout(load, estado === "en_camino" ? 30000 : 60000);
        }
      } catch {
        if (!alive) return;
        setError(true);
        setLoaded(true);
      }
    }

    setLoaded(false);
    load();
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [token]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="flex items-center gap-3 px-5 pt-safe pb-4">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 p-1.5 dark:bg-emerald-900/30">
          <img src="/logo.png" alt="MG Hogar" className="h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Seguí tu entrega</h1>
          <p className="text-sm text-slate-500">MG Hogar</p>
        </div>
      </header>

      <main className="flex-1 px-5 pb-safe">
        <div className="mx-auto w-full max-w-md">
          {!loaded ? (
            <Cargando />
          ) : error || !data ? (
            <NoEncontrado />
          ) : (
            <Seguimiento data={data} />
          )}
        </div>
      </main>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600 dark:border-slate-700 dark:border-t-emerald-500" />
      <p className="text-sm">Buscando tu pedido…</p>
    </div>
  );
}

function NoEncontrado() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
        No encontramos este seguimiento
      </h2>
      <p className="text-sm text-slate-500">
        El link puede estar vencido o ser incorrecto. Si tenés dudas, escribinos y te
        ayudamos con tu pedido.
      </p>
    </div>
  );
}

function Seguimiento({ data }) {
  const estado = data?.estado || "pendiente";
  const reprogramado = estado === "reprogramado";
  const noEntregado = estado === "no_entregado";
  const enCamino = estado === "en_camino";
  const idx = pasoIndex(estado);

  const hora = data?.hora_aprox ? String(data.hora_aprox).slice(0, 5) : null;
  const tieneCamion = data?.camion_lat != null && data?.camion_lng != null;

  return (
    <div className="flex flex-col gap-4">
      {/* Cliente + dirección (sin teléfono ni monto) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {data?.cliente && (
          <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{data.cliente}</p>
        )}
        {data?.direccion && (
          <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{data.direccion}</span>
          </p>
        )}

        {/* Stepper */}
        <div className="mt-5 flex items-center">
          {PASOS.map((paso, i) => {
            const Icon = paso.icon;
            const done = i <= idx && !noEntregado;
            const current = i === idx && !noEntregado;
            return (
              <div key={paso.id} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <span
                    className={cn(
                      "h-0.5 flex-1",
                      i === 0 ? "opacity-0" : done ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                    )}
                  />
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900",
                      current && "ring-4 ring-emerald-500/20"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={cn(
                      "h-0.5 flex-1",
                      i === PASOS.length - 1
                        ? "opacity-0"
                        : i < idx && !noEntregado
                        ? "bg-emerald-500"
                        : "bg-slate-200 dark:bg-slate-700"
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-center text-xs font-medium",
                    current ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"
                  )}
                >
                  {paso.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Estados especiales */}
      {reprogramado && (
        <Banner
          tone="amber"
          icon={CalendarClock}
          title="Tu entrega fue reprogramada"
          text="Coordinamos una nueva fecha. Vas a poder seguirla de nuevo el día pactado."
        />
      )}
      {noEntregado && (
        <Banner
          tone="amber"
          icon={AlertCircle}
          title="No pudimos entregar tu pedido"
          text="Vamos a coordinar un nuevo intento. Perdón por la demora."
        />
      )}

      {/* Detalle: franja / hora / zona */}
      <div className="grid grid-cols-2 gap-3">
        <InfoTile icon={Clock} label="Franja">
          <span className="capitalize">{cap(data?.franja) || "A confirmar"}</span>
          {hora ? ` · ${hora}` : ""}
        </InfoTile>
        <InfoTile icon={MapPin} label="Zona">
          {data?.zona || "—"}
        </InfoTile>
      </div>

      {/* Mapa del camión (solo en camino y con posición) */}
      {enCamino && tieneCamion ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Tu pedido está en camino
            </p>
            {data?.actualizado && (
              <span className="text-xs text-slate-400">{haceCuanto(data.actualizado)}</span>
            )}
          </div>
          <Suspense
            fallback={
              <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                Cargando mapa…
              </div>
            }
          >
            <SeguirMapa lat={Number(data.camion_lat)} lng={Number(data.camion_lng)} />
          </Suspense>
        </div>
      ) : enCamino ? (
        <Banner
          tone="emerald"
          icon={Truck}
          title="Tu pedido está en camino"
          text="Todavía no recibimos la ubicación del camión. Va a aparecer acá en un ratito."
        />
      ) : estado === "entregado" ? (
        <Banner
          tone="emerald"
          icon={CheckCircle2}
          title="¡Entregado!"
          text="Tu pedido ya fue entregado. ¡Gracias por tu compra!"
        />
      ) : null}

      <p className="pt-2 text-center text-xs text-slate-400">
        Actualización automática mientras tu pedido esté en camino.
      </p>
    </div>
  );
}

function InfoTile({ icon: Icon, label, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="text-sm text-slate-900 dark:text-slate-50">{children}</p>
    </div>
  );
}

function Banner({ tone, icon: Icon, title, text }) {
  const tones = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", tones[tone])}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm opacity-90">{text}</p>
      </div>
    </div>
  );
}
