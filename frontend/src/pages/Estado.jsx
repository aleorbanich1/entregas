import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Copy, Check, Wifi, Map, Bell, Info } from "lucide-react";
import { useHealth, NIVEL, NIVEL_TEXTO } from "../utils/health";
import { APP_VERSION } from "../utils/config";
import { Button } from "../components/ui/Button";
import { cn } from "../utils/cn";

const DOT = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-500",
  rojo: "bg-red-500",
};
const TEXTO_CLS = {
  verde: "text-emerald-600 dark:text-emerald-400",
  amarillo: "text-amber-600 dark:text-amber-400",
  rojo: "text-red-600 dark:text-red-400",
};
const ICONO = { conexion: Wifi, mapas: Map, notif: Bell };

/**
 * /reparto/estado — "Estado del sistema". Auto-diagnóstico para un cliente no
 * técnico: semáforos en castellano. Nunca bloquea; es sólo informativo.
 */
export default function Estado() {
  const { checks, config, mapas, refresh, diagnostico } = useHealth();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function copiar() {
    const txt = diagnostico();
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // Fallback para navegadores/contextos sin clipboard API.
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nada */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function recargar() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const dev = [config?.dev_nombre, config?.dev_contacto].filter(Boolean).join(" — ");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="flex items-center gap-3 px-5 pt-safe pb-4">
        <Link
          to="/reparto"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">Estado del sistema</h1>
          <p className="text-sm text-slate-500">Cómo viene funcionando la app</p>
        </div>
        <Button variant="ghost" size="sm" onClick={recargar} disabled={refreshing} aria-label="Actualizar">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </header>

      <main className="flex-1 px-5 pb-safe">
        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          {/* Semáforos */}
          {checks.map((c) => {
            const Icon = ICONO[c.id] || Info;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 dark:bg-slate-800">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{c.label}</p>
                    <p className="truncate text-xs text-slate-500">{c.resumen}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[c.status])} />
                    <span className={cn("text-xs font-semibold", TEXTO_CLS[c.status])}>
                      {NIVEL_TEXTO[c.status]}
                    </span>
                  </div>
                </div>
                {c.status !== NIVEL.verde && c.mensaje && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{c.mensaje}</p>
                )}
                {c.id === "mapas" && mapas?.total > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Últimos 7 días: {mapas.counts.ok || 0} ok · {mapas.counts.no_encontrada || 0} sin
                    resultado · {mapas.counts.bloqueado || 0} bloqueos · {mapas.counts.error || 0} errores
                    {mapas.ultimoBloqueo
                      ? ` · último bloqueo ${new Date(mapas.ultimoBloqueo).toLocaleDateString("es-AR")}`
                      : ""}
                  </p>
                )}
              </div>
            );
          })}

          {/* Versión */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 dark:bg-slate-800">
              <Info className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Versión de la app</p>
              <p className="text-xs text-slate-500">{APP_VERSION}</p>
            </div>
          </div>

          {/* Contacto del dev */}
          {dev && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-slate-500">Si algo no anda, avisá a tu desarrollador:</p>
              <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-50">{dev}</p>
            </div>
          )}

          {/* Copiar diagnóstico */}
          <Button variant="secondary" onClick={copiar} className="mt-1">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "¡Copiado!" : "Copiar diagnóstico"}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Copiá el diagnóstico y envialo por WhatsApp a tu desarrollador para que revise.
          </p>
        </div>
      </main>
    </div>
  );
}
