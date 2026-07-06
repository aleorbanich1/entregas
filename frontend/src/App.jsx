import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext, getAuthFromStorage, REPARTO_ROLES } from "./utils/auth";
import { socket, flushSyncQueue } from "./utils/api";
import { HealthProvider } from "./utils/health";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireRole from "./components/RequireRole";
import { Loader } from "./components/Loader";
import { Avisos } from "./components/Avisos";
import { HealthBanner } from "./components/HealthBanner";

// Páginas lazy (React.lazy + Suspense).
const Login = lazy(() => import("./pages/Login.jsx"));
const Reparto = lazy(() => import("./pages/Reparto.jsx"));
const Resumen = lazy(() => import("./pages/Resumen.jsx"));
const Estado = lazy(() => import("./pages/Estado.jsx"));
const Seguir = lazy(() => import("./pages/Seguir.jsx"));

export default function App() {
  const [auth, setAuth] = useState(getAuthFromStorage);
  const { isAuthenticated } = auth;

  // Realtime + flush de la cola offline sólo con sesión activa.
  useEffect(() => {
    if (isAuthenticated) {
      socket.connect();
      flushSyncQueue();
    } else {
      socket.disconnect();
    }
  }, [isAuthenticated]);

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={{ ...auth, setAuth }}>
        <HealthProvider enabled={isAuthenticated}>
          <BrowserRouter>
            <Suspense fallback={<Loader />}>
              <Routes>
                {/* Pública: seguimiento del cliente, sin login */}
                <Route path="/seguir/:token" element={<Seguir />} />

                {/* Login */}
                <Route
                  path="/login"
                  element={
                    isAuthenticated ? <Navigate to="/reparto" replace /> : <Login />
                  }
                />

                {/* App de Reparto: empleado / socio / jefe */}
                <Route
                  path="/reparto"
                  element={
                    <RequireRole roles={REPARTO_ROLES}>
                      <Reparto />
                    </RequireRole>
                  }
                />
                <Route
                  path="/reparto/resumen"
                  element={
                    <RequireRole roles={REPARTO_ROLES}>
                      <Resumen />
                    </RequireRole>
                  }
                />
                <Route
                  path="/reparto/estado"
                  element={
                    <RequireRole roles={REPARTO_ROLES}>
                      <Estado />
                    </RequireRole>
                  }
                />

                {/* Default */}
                <Route
                  path="/"
                  element={
                    <Navigate to={isAuthenticated ? "/reparto" : "/login"} replace />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>

            {/* Overlays globales sólo para usuarios autenticados */}
            {isAuthenticated && (
              <>
                <Avisos />
                <HealthBanner />
              </>
            )}
          </BrowserRouter>
        </HealthProvider>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
