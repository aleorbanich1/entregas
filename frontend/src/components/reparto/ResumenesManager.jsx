import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, RefreshCw, Trash2 } from "lucide-react";
import { api, socket } from "../../utils/api";
import { fmtFechaHora } from "../../utils/format";
import { useAuth, ROLES } from "../../utils/auth";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/Confirm";

/**
 * ResumenesManager — pestaña de cierres de día (resúmenes). La ven todos, pero
 * SÓLO el admin (jefe) puede borrar un resumen. Lee los eventos durables
 * 'dia_cerrado' y se actualiza sola cuando se cierra un día (broadcast DIA_CERRADO).
 */
export function ResumenesManager() {
  const { user } = useAuth();
  const esAdmin = user?.role === ROLES.JEFE;
  const [confirm, confirmUI] = useConfirm();
  const [cierres, setCierres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(() => {
    setLoading(true);
    setError("");
    return api("/eventos?tipo=dia_cerrado&order=reciente&limit=120")
      .then((data) => setCierres(data || []))
      .catch(() => setError("No se pudieron cargar los resúmenes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Realtime: si se cierra un día mientras miro, refresco la lista.
  useEffect(() => {
    let t;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => cargar(), 500);
    };
    socket.on("DIA_CERRADO", refresh);
    return () => {
      clearTimeout(t);
      socket.off("DIA_CERRADO", refresh);
    };
  }, [cargar]);

  async function borrar(c) {
    if (
      !(await confirm("¿Borrar este resumen del día? No se puede deshacer.", {
        title: "Borrar resumen",
        confirmText: "Borrar",
      }))
    )
      return;
    setError("");
    const prev = cierres;
    setCierres((cur) => cur.filter((x) => x.id !== c.id));
    try {
      await api(`/eventos/${c.id}`, { method: "DELETE" });
    } catch (e) {
      setCierres(prev);
      setError(e?.message || "No se pudo borrar el resumen");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
          <ClipboardCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Resúmenes del día</p>
          <p className="text-xs text-slate-500">Cada vez que se cierra un día, el resumen queda acá.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={cargar} aria-label="Refrescar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando resúmenes…</p>
      ) : cierres.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Todavía no hay días cerrados. Cuando un repartidor o encargado cierre el día, el resumen
          aparece acá.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cierres.map((c) => (
            <CierreItem key={c.id} cierre={c} esAdmin={esAdmin} onBorrar={() => borrar(c)} />
          ))}
        </ul>
      )}

      {confirmUI}
    </div>
  );
}

// Intenta separar el encabezado ("Cierre 7 de julio — ...") del resto para
// destacarlo; si no matchea, muestra el detalle completo.
function CierreItem({ cierre, esAdmin, onBorrar }) {
  const detalle = String(cierre?.detalle || "").trim();
  const [titulo, ...resto] = detalle.split(" — ");
  const cuerpo = resto.join(" — ");

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
          {titulo || "Cierre del día"}
        </p>
        <span className="shrink-0 text-xs text-slate-400">{fmtFechaHora(cierre?.created_at)}</span>
        {esAdmin && (
          <button
            onClick={onBorrar}
            className="-mt-1 -mr-1 shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            aria-label="Borrar resumen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {cuerpo && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{cuerpo}</p>
      )}
    </li>
  );
}

export default ResumenesManager;
