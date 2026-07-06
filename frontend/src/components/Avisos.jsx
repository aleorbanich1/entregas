import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Route, CheckCheck, X } from "lucide-react";
import { socket } from "../utils/api";
import { notify } from "../utils/reminders";

/**
 * Avisos — toasts en vivo para TODOS los usuarios (no solo el jefe). Escucha el
 * broadcast de Realtime: HOJA_PUBLICADA y DIA_CERRADO. Best-effort: si además hay
 * permiso de notificaciones, dispara una notificación del sistema.
 */
export function Avisos() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const push = (t) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, ...t }]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 8000);
      // Notificación del sistema (web) o nativa (APK), si hay permiso.
      notify(t.title, t.text);
    };

    const onHoja = (p) =>
      push({
        tone: "emerald",
        icon: "route",
        title: "Se publicó la hoja de ruta",
        text: p?.camion_id
          ? `Camión ${p.camion_id} · ${p?.cantidad ?? 0} paradas`
          : "Revisá tu hoja de hoy",
      });
    const onDia = (p) =>
      push({
        tone: "slate",
        icon: "check",
        title: "Se cerró el día",
        text: p?.fecha ? `Fecha ${p.fecha}` : "Resumen disponible",
      });

    socket.on("HOJA_PUBLICADA", onHoja);
    socket.on("DIA_CERRADO", onDia);
    return () => {
      socket.off("HOJA_PUBLICADA", onHoja);
      socket.off("DIA_CERRADO", onDia);
    };
  }, []);

  const close = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-safe">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = t.icon === "route" ? Route : CheckCheck;
          const tone =
            t.tone === "emerald"
              ? "border-emerald-200 bg-white text-slate-900 dark:border-emerald-900/50 dark:bg-slate-900 dark:text-slate-50"
              : "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50";
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border p-3 shadow-xl ${tone}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.text && <p className="truncate text-xs text-slate-500">{t.text}</p>}
              </div>
              <button
                onClick={() => close(t.id)}
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default Avisos;
