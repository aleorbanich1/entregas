import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // escuchar en la red (para probar desde el celular / túneles)
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
  },
  plugins: [
    // Permitir JSX dentro de archivos .js (convención del doc: auth.js con JSX)
    react({ include: /\.(js|jsx)$/ }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'logo.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'MG Hogar — Reparto',
        short_name: 'MG Reparto',
        description: 'Reparto y seguimiento de entregas — MG Hogar',
        lang: 'es',
        theme_color: '#059669',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Inyecta los handlers de Web Push (push / notificationclick) en el SW
        // generado, conservando todo el precache y runtimeCaching.
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Fuentes (Inter) — cache de larga duración
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // GET a la API de Supabase (REST) — fresco primero, cae al cache offline
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/rest/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Tiles de OpenStreetMap — para que el mapa sirva algo estando offline
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // esbuild (dev + deps) también debe tratar los .js del proyecto como JSX
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    // Escanear SOLO el index.html raíz (ignora la carpeta android/ de Capacitor)
    entries: ['index.html'],
    // El escáner de dependencias también debe leer JSX dentro de los .js
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Separar los vendors pesados e INDEPENDIENTES (no importan a los demás),
        // así evitamos chunks circulares. El resto (react, router, supabase) va junto.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('leaflet')) return 'leaflet-vendor'
          if (id.includes('framer-motion')) return 'motion-vendor'
          return 'vendor'
        },
      },
    },
  },
})
