# Edge Function: `geocode`

Geocodifica direcciones (dirección → lat/lng) con caché y rate-limit, usando
**Nominatim (OpenStreetMap)**. La llama el front vía `api('/geocode', { method:'POST', body:{ direccion } })`
→ `transport.js` → `supabase.functions.invoke('geocode')`.

## Comportamiento

1. Normaliza la dirección y busca en `entregas_geocache` (devuelve de caché si existe).
2. Si no está: llama a Nominatim (`countrycodes=ar`, `limit=1`) con `User-Agent`
   que incluye `entregas_config.contacto_email`, respetando ~1 request/segundo
   (se espacia según el último intento en `entregas_geocode_log`).
3. **Cachea siempre** el resultado (encontrado o no) en `entregas_geocache`.
4. Ante bloqueo/red/HTTP no rompe: devuelve `{ geocode_status: 'fallo' }`.

Registra cada intento externo en `entregas_geocode_log` con `resultado`:
`ok` | `no_encontrada` | `bloqueado` (429/403 o "Usage limit reached") | `error`.

> Los aciertos de caché **no** se registran como intento (no golpean a Nominatim).
> Los fallos transitorios (`bloqueado`/`error`) **no** se cachean, para poder reintentar.

## Respuesta

```json
{ "lat": -34.60, "lng": -58.38, "geocode_status": "ok", "cached": false }
```

`geocode_status`: `ok` | `no_encontrada` | `fallo`.

## Deploy

```bash
supabase functions deploy geocode --project-ref qsewancpibyyakitwpnr
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta el runtime de Edge
Functions automáticamente (no hace falta configurarlos).

## Atribución

Donde se muestre el mapa (Leaflet), usar `attribution: "© OpenStreetMap contributors"`
(constante `OSM_ATTRIBUTION` en `src/utils/config.js`).
