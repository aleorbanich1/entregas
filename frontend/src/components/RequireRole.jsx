import { Navigate, useLocation } from "react-router-dom";
import { useAuth, useAuthActions } from "../utils/auth";
import { Button } from "./ui/Button";

/**
 * Guard por rol. Reutiliza el AuthContext compartido (no duplica login).
 *
 *  - Sin sesión → redirige a /login (recordando a dónde quería ir).
 *  - Con sesión pero rol fuera de los válidos (empleado/socio/jefe) → pantalla
 *    "sin acceso" TERMINAL con logout. NO redirige a /login (evita el bucle).
 *
 * En esta app los tres roles válidos entran, así que "sin acceso" sólo aparece
 * para un rol inesperado (p. ej. vacío o uno futuro no contemplado).
 */
export function RequireRole({ roles, children }) {
  const auth = useAuth();
  const { logout } = useAuthActions();
  const location = useLocation();

  if (!auth?.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && roles.length > 0 && !roles.includes(auth.user?.role)) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center dark:bg-slate-950">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Sin acceso
        </h1>
        <p className="max-w-xs text-sm text-slate-500">
          Tu cuenta ({auth.user?.role || "sin rol"}) no tiene acceso a Reparto.
        </p>
        <Button variant="secondary" size="sm" onClick={logout}>
          Cambiar de cuenta
        </Button>
      </div>
    );
  }

  return children;
}

export default RequireRole;
