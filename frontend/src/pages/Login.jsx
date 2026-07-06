import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { emailFor } from "../utils/userEmail";
import { useAuthActions } from "../utils/auth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

/**
 * Login — copia el flujo de la app de Tareas (misma auth/tabla `users`):
 * emailFor(usuario) → signInWithPassword → perfil por auth_id. Sin perfil =
 * cuenta pendiente de aprobación. Al entrar, todos van a /reparto.
 */
export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthActions();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const email = emailFor(username.trim());
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authErr) throw new Error("Usuario o contraseña incorrectos");

      const { data: profile, error: pErr } = await supabase
        .from("users")
        .select("id, username, full_name, role")
        .eq("auth_id", data.user.id)
        .maybeSingle();
      if (pErr) throw new Error("No se pudo verificar el perfil del usuario");
      // Sin perfil = cuenta creada pero todavía no aprobada por el jefe.
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error("Tu cuenta está pendiente de aprobación por el jefe.");
      }

      login(data.session.access_token, profile);
      navigate("/reparto", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col items-center gap-3 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 p-2 text-emerald-600 shadow-sm dark:bg-emerald-900/30 dark:text-emerald-400">
            <img src="/logo.png" alt="MG Hogar" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Reparto
            </h1>
            <p className="text-sm text-slate-500">MG Hogar</p>
          </div>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
          >
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="username"
              className="ml-1 text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Usuario
            </label>
            <Input
              id="username"
              type="text"
              placeholder="ej: ale"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="ml-1 text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Contraseña
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
