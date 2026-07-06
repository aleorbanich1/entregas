# PWA, Notificaciones y APK (Capacitor 8)

Mismo patrón que la app de Tareas, para que la fusión sea directa.

## PWA (vite-plugin-pwa)

- `registerType: 'autoUpdate'` → el Service Worker se actualiza solo.
- **Precache** de la app shell + **runtime caching**:
  - Fuentes de Google (Inter) → `CacheFirst`.
  - GET a la API de Supabase (`/rest/…`) → `NetworkFirst` (fresco, cae al cache offline).
  - Tiles de OpenStreetMap → `StaleWhileRevalidate` (mapa usable offline).
- `theme_color #059669`, íconos en `public/icons/` y `manifest.webmanifest` generado.
- Instalable en el celular ("Agregar a pantalla de inicio").

Probar la PWA: `yarn build && yarn preview` (el SW **no** corre en `yarn dev`).

## Notificaciones

Fachada única en `src/utils/reminders.js` (`notificationStatus`, `requestNotifications`, `notify`):

- **Web (PWA)**: `Notification` API para avisos en vivo, y **Web Push opcional** (VAPID)
  para que lleguen con la app cerrada. Handlers en `public/push-sw.js` (inyectado al SW).
- **APK (Capacitor)**: `@capacitor/local-notifications` (canal `avisos`), detectando
  plataforma con `Capacitor.isNativePlatform()` (`src/utils/nativeNotifications.js`).

Se usan para **"hoja de ruta lista"** (`HOJA_PUBLICADA`) y **"día cerrado"** (`DIA_CERRADO`):
el componente `Avisos` recibe el broadcast y llama a `notify(title, body)`.
El `NotificationGate` (al iniciar sesión) pide el permiso y prepara el canal / la suscripción.

### Web Push (opcional)

1. Generar el par VAPID y poner la **pública** en `.env`: `VITE_VAPID_PUBLIC_KEY=...`
   (la privada va **sólo** en la Edge Function que envía el push).
2. La suscripción del navegador se guarda en la tabla `push_subscriptions` (compartida
   con Tareas) vía `src/utils/webPush.js`.
3. Falta una Edge Function que, ante `hoja_publicada` / `dia_cerrado`, envíe el push a las
   suscripciones del camión/usuarios (pendiente).

## APK Android (Capacitor 8)

Config en `capacitor.config.json` (`appId: com.mghogar.reparto`, `webDir: dist`).

```bash
yarn build                 # genera dist/
yarn cap:add:android       # una sola vez: crea el proyecto android/ (requiere Android SDK)
yarn cap:sync              # copia la web + plugins al proyecto nativo
yarn cap:open:android      # abre Android Studio para compilar/firmar el APK
```

> `cap add android` necesita Android Studio / SDK instalados; por eso el proyecto
> `android/` no se versiona (está en `.gitignore`). La **misma web** se empaqueta como APK.
