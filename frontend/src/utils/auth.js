import { createContext, useContext, useCallback } from "react";
import { supabase } from "./supabaseClient";

/**
 * auth.js — MISMA forma que la app de Tareas (para la fusión). El AuthContext se
 * provee en App.jsx con useState(getAuthFromStorage). El signInWithPassword vive
 * en Login.jsx; acá sólo persistimos token + perfil.
 *
 * Sesión en localStorage: mg_token, mg_user (compartidos con Tareas).
 */
export const AuthContext = createContext(null);

/** Roles válidos de la app. 'repartidor' existe en la DB pero NO se usa acá. */
export const ROLES = { EMPLEADO: "empleado", SOCIO: "socio", JEFE: "jefe" };

/** Todos los roles válidos entran a /reparto (empleado = carga y reparte). */
export const REPARTO_ROLES = [ROLES.EMPLEADO, ROLES.SOCIO, ROLES.JEFE];

/**
 * Comparación de ids robusta: los ids pueden venir como string o number
 * (Supabase, realtime, params de ruta). SIEMPRE comparar así.
 */
export const sameId = (a, b) =>
  a != null && b != null && Number(a) === Number(b);

export function getAuthFromStorage() {
  try {
    const token = localStorage.getItem("mg_token");
    const user = JSON.parse(localStorage.getItem("mg_user") || "null");
    return { token, user, isAuthenticated: !!token && !!user };
  } catch {
    return { token: null, user: null, isAuthenticated: false };
  }
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthActions() {
  const { setAuth } = useContext(AuthContext);

  const login = useCallback(
    (token, user) => {
      localStorage.setItem("mg_token", token);
      localStorage.setItem("mg_user", JSON.stringify(user));
      // Reaparece el aviso de permisos de notificación en cada inicio de sesión.
      sessionStorage.removeItem("mg_notif_gate_seen");
      setAuth({ token, user, isAuthenticated: true });
    },
    [setAuth]
  );

  const logout = useCallback(() => {
    supabase.auth.signOut().catch(() => {});
    localStorage.clear();
    setAuth({ token: null, user: null, isAuthenticated: false });
  }, [setAuth]);

  return { login, logout };
}
