import { useState } from "react";
import { Link } from "react-router-dom";
import { format, addDays } from "date-fns";
import { LogOut, MapPin, Truck, Settings, PackagePlus, Zap, Route, ClipboardList, BarChart3, Activity } from "lucide-react";
import { useAuth, useAuthActions } from "../utils/auth";
import { Button } from "../components/ui/Button";
import { NotificationGate } from "../components/NotificationGate";
import { EntregaForm } from "../components/reparto/EntregaForm";
import { RepartidorHoy } from "../components/reparto/RepartidorHoy";
import { HojaDeRuta } from "../components/reparto/HojaDeRuta";
import { ZonasManager } from "../components/reparto/ZonasManager";
import { CamionesManager } from "../components/reparto/CamionesManager";
import { AjustesManager } from "../components/reparto/AjustesManager";
import { cn } from "../utils/cn";

const TABS = [
  { id: "hoy", label: "Hoy", icon: ClipboardList },
  { id: "ruta", label: "Ruta", icon: Route },
  { id: "zonas", label: "Zonas", icon: MapPin },
  { id: "camiones", label: "Camiones", icon: Truck },
  { id: "ajustes", label: "Ajustes", icon: Settings },
];

const hoy = () => format(new Date(), "yyyy-MM-dd");
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
          to="/reparto/estado"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Estado del sistema"
        >
          <Activity className="h-4 w-4" />
        </Link>
        <Link
          to="/reparto/resumen"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Resumen del día"
        >
          <BarChart3 className="h-4 w-4" />
        </Link>
        <Button variant="ghost" size="sm" onClick={logout} aria-label="Salir">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1 px-5 pb-safe">
        <div className="mx-auto w-full max-w-md">
          <NotificationGate userId={user?.id} />

          {/* Acciones rápidas: carga de entrega */}
          <div className="mb-4 flex flex-col gap-2">
            <Button size="lg" onClick={() => setFormFecha(manana())}>
              <PackagePlus className="h-5 w-5" />
              Nueva entrega
            </Button>
            <button
              onClick={() => setFormFecha(hoy())}
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 active:scale-[0.98] dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              <Zap className="h-4 w-4" />
              Entrega de último momento (hoy)
            </button>
          </div>

          {/* Pestañas */}
          <nav className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors",
                    active
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
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
