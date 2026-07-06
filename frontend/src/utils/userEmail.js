// Mapea el "usuario" (login por nombre de usuario) a un email interno para
// Supabase Auth. Debe coincidir EXACTAMENTE con el slug de backend/seed-auth.cjs.
//   "Alejandro"  -> alejandro@mghogar.local
//   "Empleado 1" -> empleado1@mghogar.local
export function slug(username) {
  return (username || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');                        // solo a-z0-9
}

export const emailFor = (username) => `${slug(username)}@mghogar.local`;
