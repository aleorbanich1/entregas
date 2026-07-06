import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * Cliente ÚNICO de Supabase para toda la app. No crear un segundo cliente:
 * la app fusionada debe compartir auth/sesión con la app de Tareas.
 *
 * Sólo debe importarse desde transport.js (y auth.js). Los componentes NUNCA
 * hablan con Supabase directo: siempre pasan por api().
 */
export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "mg_supabase_auth",
    },
  }
);
