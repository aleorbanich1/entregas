# MG Hogar — Principios y convenciones (para construir apps compatibles)

> **Para quién es este documento:** para otra IA (o dev) que va a construir **otra
> app** usando el **mismo stack y las mismas convenciones** que esta app de Tareas.
> La idea es que ambas puedan **fusionarse en una sola** cuando estén terminadas.
> Este documento define lo que **NO hay que romper** para que esa fusión sea
> posible y para que las dos apps se **vean y se comporten como una sola**.
>
> Sirve para **cualquier app** que se quiera integrar con esta.
>
> Regla de oro: **cuando dudes, imitá exactamente lo que ya hace la app de Tareas.**

---

## 1. Stack (NO cambiar)

- **Frontend:** React **19** + **Vite** (build) + **vite-plugin-pwa** (PWA/Service Worker).
- **Estilos:** **Tailwind CSS v4** (`@import "tailwindcss";` en `index.css`, sin config gigante).
- **Animaciones:** **framer-motion** (`motion`, `AnimatePresence`).
- **Íconos:** **lucide-react** (nada de otras librerías de íconos).
- **Ruteo:** **react-router-dom v7**, con páginas **lazy** (`React.lazy` + `Suspense`).
- **Backend:** **NO hay backend propio.** La app habla **directo con Supabase**
  (anon key + Supabase Auth).
- **Base de datos / Auth / Realtime:** **Supabase** (mismo proyecto: ref `qsewancpibyyakitwpnr`).
- **Offline:** **localforage** para la cola de sincronización.
- **Mobile:** **Capacitor 8** (Android). La misma web se empaqueta como APK.
- **Gestor de paquetes:** **yarn** (vía `corepack`). **No usar npm.**
- Otras libs usadas: `clsx` + `tailwind-merge` (helper `cn`), `date-fns`, `uuid`.

---

## 2. Estructura de carpetas (replicar)

```
frontend/
  src/
    main.jsx            # entrypoint
    App.jsx             # Router + AuthContext + ErrorBoundary
    index.css           # @import tailwindcss + scrollbar
    pages/              # una página por rol/vista (lazy)
    components/
      ui/               # Button, Input, Select, Modal, CalendarPicker (reutilizables)
      *.jsx             # componentes de dominio (TaskCard, ChatPanel, etc.)
    utils/
      api.js            # capa pública: api(path, opts), socket, flushSyncQueue (+ offline)
      transport.js      # traduce api(path) → operaciones Supabase + shim realtime
      supabaseClient.js # cliente único de Supabase
      config.js         # variables de entorno (VITE_*)
      auth.js           # AuthContext, login/logout
      cn.js             # helper clsx + tailwind-merge
```

---

## 3. Arquitectura — patrones NO NEGOCIABLES

### 3.1 Sin backend: todo pasa por `transport.js`

Los componentes **nunca** llaman a Supabase directo. Usan `api(path, opts)` de
`utils/api.js`, que:

- Mantiene una **cola offline** (localforage): si no hay red, encola la mutación y
  la reintenta al volver la conexión (`flushSyncQueue`).
- Delega en `transport.js`, que mapea rutas tipo REST a operaciones Supabase.

`transport.js` expone dos cosas:

- `request(path, method, body)` — imita respuestas de un backend REST.
- `socket` — **shim con la misma interfaz que socket.io** (`connect/disconnect/on/off`)
  pero por debajo usa **Supabase Realtime**. Emite eventos ya "enriquecidos".

> La app nueva **debe seguir este mismo patrón**: agregar sus rutas en `transport.js`
> (o un archivo equivalente con la misma forma) y sus canales realtime. Nunca meter
> `supabase.from(...)` suelto en un componente.

### 3.2 Auth y usuarios (COMPARTIDOS — clave para la fusión)

- Login con **Supabase Auth** (`signInWithPassword`).
- Tabla **`users`** con `id` (bigint), `auth_id` (uuid → `auth.users`), `username`,
  `full_name`, `role` (`'empleado' | 'socio' | 'jefe'`).
- La sesión se guarda en `localStorage` (`mg_token`, `mg_user`) vía `auth.js`.
- **La app nueva usa los MISMOS usuarios, la MISMA auth y los mismos roles.** No
  crear un sistema de login paralelo. Si necesita roles nuevos, extender los
  existentes, no reemplazarlos.

### 3.3 Seguridad (RLS)

- Al ser anon key + Auth, la seguridad depende de **RLS**. Toda tabla nueva debe
  tener políticas basadas en el usuario/rol actual, usando funciones helper
  `current_app_user_id()` / `current_app_role()` (SECURITY DEFINER, ya existen).
- Ver `supabase/migrations/0003_rls_policies.sql` como plantilla.

### 3.4 Nombres de tablas (evitar colisiones para la fusión)

- Esta app usa: `users`, `tasks`, `messages`, `push_subscriptions`.
- La app nueva debe crear **tablas propias con nombres claros y sin chocar** con las
  de arriba. Si conviene, usar un **prefijo temático** propio del dominio de esa app.
- **`users` (y la auth) se reutiliza** — no se duplica.

---

## 4. Sistema de diseño (colorimetría y estética — respetar al pie)

### 4.1 Paleta

- **Color primario / marca:** **emerald** (`emerald-600` = `#059669`).
  - Botones primarios, acentos, estados "ok". En dark: `emerald-500`.
  - `theme_color` de la PWA = `#059669`.
- **Neutros:** **slate**.
  - Fondo claro `bg-slate-50`, fondo oscuro `bg-slate-950`.
  - Tarjetas: blanco (`bg-white`) / `dark:bg-slate-900`.
  - Bordes: `border-slate-200` / `dark:border-slate-800`.
  - Texto: `text-slate-900` / `dark:text-slate-50`; secundario `text-slate-500`.
- **Semánticos:**
  - Peligro / error / eliminar: **red** (`red-600`).
  - Advertencia / temporal: **amber**.
  - Info / secundario: **blue** o **indigo**.
- **Modo oscuro:** obligatorio en todo. Siempre pares `light`/`dark:` y respetar
  `prefers-color-scheme`.

### 4.2 Forma y tipografía

- **Tipografía:** **Inter** (cargada desde Google Fonts de forma no bloqueante en `index.html`).
- **Radios:** `rounded-xl` (botones, inputs), `rounded-2xl` (tarjetas, modales),
  `rounded-full` (chips, badges, avatares).
- **Sombras:** suaves (`shadow-sm`, `shadow-xl` en flotantes/modales).
- **Espaciado / mobile-first:** diseñado para celular. Contenedores de tarjeta
  centrados (`w-[85%] mx-auto`), alto `100dvh`, respetar áreas seguras (`pb-safe`).

### 4.3 Interacción

- Botones: `active:scale-[0.98]`, transiciones suaves, `focus-visible:ring` emerald.
- Animaciones de entrada/salida con framer-motion (springs suaves: `damping ~25, stiffness ~300`).
- Chips/badges: `text-xs font-medium px-2 py-0.5 rounded-full` con fondo teñido
  (ej. `bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400`).

---

## 5. Componentes UI (reutilizar tal cual)

Usar los componentes de `components/ui/` en la app nueva (copiarlos idénticos):

- **`Button`** — `variant`: `primary` (emerald) | `secondary` (slate) | `danger`
  (red) | `ghost`. `size`: `default` (min-h 52) | `sm` | `lg`.
- **`Input`**, **`Select`** — inputs con el mismo estilo (bordes slate, focus emerald).
- **`Modal`** — overlay `bg-slate-950/50 backdrop-blur`, panel `rounded-2xl`,
  header sticky con título + botón X. Animado con framer-motion.
- **`CalendarPicker`** — selector de fecha.
- Helper **`cn(...)`** (`clsx` + `tailwind-merge`) para componer clases. Usarlo siempre.

Patrones visuales recurrentes: header con logo + saludo "Hola, {nombre}", listas de
tarjetas, banners de aviso (ámbar/emerald), FAB flotante (ej. chat).

---

## 6. Convenciones de código

- **Idioma:** comentarios y textos de UI en **español (Argentina)**. Fechas/horas
  con `toLocaleDateString('es-AR')` / `toLocaleTimeString('es-AR')`.
- **Zona horaria:** operación en **Argentina (−03:00)**. Al parsear fechas
  `'YYYY-MM-DD'`, hacerlo **al mediodía** (`new Date(fecha + 'T12:00:00')`) para
  evitar el desfase que corre el día para atrás.
- **Estado:** React hooks. Nada de Redux. Context solo para auth.
- **Comparaciones de IDs:** siempre `Number(a) === Number(b)` (los ids pueden venir
  como string o number).
- **Fallos defensivos:** los componentes no deben romperse por datos incompletos de
  realtime (ej. `task.priority?.toLowerCase()`). Hay un `ErrorBoundary` global.
- **Offline:** toda mutación pasa por `api()` (nunca romper la cola offline).

---

## 7. PWA / Capacitor / Notificaciones

- **PWA:** `vite-plugin-pwa` con `registerType: 'autoUpdate'`. Service Worker con
  precache + runtime caching (fonts, API GET). Push handlers en `public/push-sw.js`
  inyectados vía `workbox.importScripts`.
- **Capacitor:** misma web → APK. Detectar plataforma con `Capacitor.isNativePlatform()`.
  Notificaciones nativas con `@capacitor/local-notifications` (funcionan con la app
  cerrada). Web Push (opcional) con VAPID + Edge Function programada.
- **Permisos:** al iniciar sesión se muestra un aviso para activar notificaciones
  (componente `NotificationGate`, sirve web y APK).

---

## 8. Reglas para la FUSIÓN (lo más importante de respetar)

Para que las dos apps se unan en una sola sin fricción:

1. **Mismo proyecto Supabase**, misma **auth**, misma tabla **`users`** y mismos **roles**.
2. **Tablas nuevas con nombres propios** (no pisar `tasks`/`messages`/etc.). Prefijo
   temático claro si hace falta.
3. **Mismo sistema de diseño** (emerald + slate, Inter, radios, dark mode, componentes `ui/`).
   La app fusionada debe verse como **una sola**, no como dos pegadas.
4. **Mismo patrón de datos:** `api()` + `transport.js` + shim `socket` de realtime.
   Nada de fetch directo ni de un segundo cliente Supabase.
5. **Mismas convenciones** de idioma (es-AR), zona horaria (−03), IDs numéricos,
   offline-first, `ErrorBoundary`.
6. **Ruteo por rol:** hoy existen `/socio`, `/jefe`, `/empleado`. La app nueva debería
   sumar **sus propias rutas** reutilizando el `AuthContext` y el guard por rol, sin
   duplicar el login.
7. **Variables de entorno** con prefijo `VITE_` en `config.js` (nunca claves
   `service_role` en el cliente; solo `anon`).

---

## 9. Checklist rápido antes de dar por buena una pantalla nueva

- [ ] ¿Usa `api()`/`transport.js` (no Supabase directo en el componente)?
- [ ] ¿Usa los componentes `ui/` y el helper `cn`?
- [ ] ¿Emerald como primario, slate como neutro, y **dark mode** funcionando?
- [ ] ¿Textos en español, fechas es-AR, fechas parseadas al mediodía?
- [ ] ¿Funciona sin conexión (mutaciones encoladas)?
- [ ] ¿Reutiliza `users`/auth/roles y no crea login paralelo?
- [ ] ¿Tablas nuevas con nombres que no chocan con las existentes?
- [ ] ¿Mobile-first y con áreas seguras?

> Si todo esto se cumple, la app nueva va a poder fusionarse con esta de forma
> natural y el usuario final va a sentir que siempre fue **una sola app**.
