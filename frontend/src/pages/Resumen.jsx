import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ResumenDia } from "../components/reparto/ResumenDia";
import { Historial } from "../components/reparto/Historial";

/**
 * /reparto/resumen — totales del día por camión y global + cierre del día, y
 * debajo el historial buscable. Visible a jefe/socio y también al repartidor.
 */
export default function Resumen() {
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
          <h1 className="text-lg font-semibold leading-tight">Resumen del día</h1>
          <p className="text-sm text-slate-500">Totales, cierre e historial</p>
        </div>
      </header>

      <main className="flex-1 px-5 pb-safe">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <ResumenDia />
          <Historial />
        </div>
      </main>
    </div>
  );
}
