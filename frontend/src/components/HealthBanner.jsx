import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X, ChevronRight } from "lucide-react";
import { useHealth, NIVEL } from "../utils/health";

/**
 * Banner fijo que aparece en TODA la app cuando algún semáforo no está en verde.
 * Muestra el problema en criollo + a quién avisar (dev desde entregas_config).
 * Es sólo informativo; se puede cerrar y no bloquea nada.
 */
export function HealthBanner() {
  const { worst, worstCheck, config } = useHealth();
  const [dismissedFor, setDismissedFor] = useState(null);

  if (worst === NIVEL.verde || !worstCheck) return null;
  if (dismissedFor === worstCheck.status + worstCheck.id) return null;

  const rojo = worst === NIVEL.rojo;
  const dev = [config?.dev_nombre, config?.dev_contacto].filter(Boolean).join(" — ");

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 pb-safe">
      <div
        className={`pointer-events-auto mb-3 flex w-full max-w-md items-start gap-3 rounded-2xl border p-3 shadow-xl ${
          rojo
            ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/80 dark:text-red-200"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/80 dark:text-amber-200"
        }`}
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{worstCheck.mensaje}</p>
          {dev && (
            <p className="mt-1 text-xs opacity-90">
              Avisá a tu desarrollador: <span className="font-semibold">{dev}</span>
            </p>
          )}
          <Link
            to="/reparto/estado"
            className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold underline underline-offset-2"
          >
            Ver estado del sistema
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          onClick={() => setDismissedFor(worstCheck.status + worstCheck.id)}
          className="shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default HealthBanner;
