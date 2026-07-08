import { useState } from "react";
import { Link } from "react-router-dom";
import { format, addDays } from "date-fns";
import { LogOut, MapPin, Truck, Settings, PackagePlus, Route, ClipboardList, BarChart3, Activity, CreditCard, ClipboardCheck } from "lucide-react";
import { useAuth, useAuthActions } from "../utils/auth";
import { Button } from "../components/ui/Button";
import { NotificationGate } from "../components/NotificationGate";
import { EntregaForm } from "../components/reparto/EntregaForm";
import { RepartidorHoy } from "../components/reparto/RepartidorHoy";
import { HojaDeRuta } from "../components/reparto/HojaDeRuta";
import { ZonasManager } from "../components/reparto/ZonasManager";
import { CamionesManager } from "../components/reparto/CamionesManager";
import { MediosPagoManager } from "../components/reparto/MediosPagoManager";
import { ResumenesManager } from "../components/reparto/ResumenesManager";
import { AjustesManager } from "../components/reparto/AjustesManager";
import { cn } from "../utils/cn";

// Todas las pestañas las ven todos. (El borrado de resúmenes sí es sólo admin,
// eso se controla dentro de la propia pestaña.)
const TABS = [
  { id: "hoy", label: "Hoy", icon: ClipboardList },
  { id: "ruta", label: "Ruta", icon: Route },
  { id: "zonas", label: "Zonas", icon: MapPin },
  { id: "camiones", label: "Camiones", icon: Truck },
  { id: "pagos", label: "Pagos", icon: CreditCard },
  { id: "resumenes", label: "Resúmenes", icon: ClipboardCheck },
  { id: "ajustes", label: "Ajustes", icon: Settings },
];

const manana = () => format(addDays(new Date(), 1), "yyyy-MM-dd");

/**
 * Reparto — pantalla de gestión (empleado / socio / jefe): zonas, camiones y
 * ajustes del local. Todo por api()/transport, con los componentes ui/.
 */
export default function Reparto() {
  const { user } = useAuth();
  const { logout } = useAuthActions();
  // El repartidor (empleado) arranca en "Hoy"; socio/jefe en la planificación "Ruta".
  const [tab, setTab] = useState(() => (user?.role === "empleado" ? "hoy" : "ruta"));
  const [formFecha, setFormFecha] = useState(null); // fecha default; abre el form si != null

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="flex items-center gap-3 px-5 pt-safe pb-4">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 p-1.5 dark:bg-emerald-900/30">
          <img src="/logo.png" alt="MG Hogar" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight">
            Hola, {user?.full_name || user?.username || "che"}
          </h1>
          <p className="text-sm capitalize text-slate-500">{user?.role}</p>
        </div>
        <Link
          to="/reparto/resumen"
          className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          Resumen
        </Link>
        <Link
          to="/reparto/estado"
          className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Activity className="h-4 w-4 shrink-0" />
          Estado
        </Link>
        <Button variant="ghost" size="sm" onClick={logout} aria-label="Salir">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1 px-5 pb-safe">
        <div className="mx-auto w-full max-w-md">
          <NotificationGate userId={user?.id} />

          {/* Acción rápida: cargar entrega */}
          <div className="mb-4">
            <Button size="lg" className="w-full" onClick={() => setFormFecha(manana())}>
              <PackagePlus className="h-5 w-5" />
              Nueva entrega
            </Button>
          </div>

          {/* Pestañas */}
          <nav className="flex flex-wrap justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex basis-[22%] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-medium transition-colors",
                    active
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate max-w-full">{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Contenido */}
          <div className="mt-4">
            {tab === "hoy" && <RepartidorHoy />}
            {tab === "ruta" && <HojaDeRuta />}
            {tab === "zonas" && <ZonasManager />}
            {tab === "camiones" && <CamionesManager />}
            {tab === "pagos" && <MediosPagoManager />}
            {tab === "resumenes" && <ResumenesManager />}
            {tab === "ajustes" && <AjustesManager />}
          </div>
        </div>
      </main>

      <EntregaForm
        open={formFecha != null}
        fechaDefault={formFecha || manana()}
        onClose={() => setFormFecha(null)}
        onCreated={() => setFormFecha(null)}
      />
    </div>
  );
}
