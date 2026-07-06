// ruta.js — planificación de la hoja de ruta en JS puro (sin API externa).
//  - Distancia haversine sobre lat/lng.
//  - Orden de visita: vecino-más-cercano desde el origen del local + mejora 2-opt.
//  - Las entregas SIN coordenadas van al final, agrupadas por zona.
//  - Link a Google Maps (dir/?api=1) partido en tramos si hay más de 9 paradas.

const R = 6371; // radio terrestre en km
const toRad = (d) => (d * Math.PI) / 180;

const hasCoords = (e) =>
  e && e.lat != null && e.lng != null && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng));

const pt = (e) => ({ lat: Number(e.lat), lng: Number(e.lng) });

/** Distancia en km entre dos puntos {lat,lng}. */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Largo total de una ruta abierta (origen fijo, sin volver).
function routeLength(origin, stops) {
  let total = 0;
  let prev = origin;
  for (const s of stops) {
    total += haversine(prev, pt(s));
    prev = pt(s);
  }
  return total;
}

// Vecino-más-cercano partiendo del origen.
function nearestNeighbor(origin, entregas) {
  const remaining = [...entregas];
  const route = [];
  let current = origin;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current, pt(remaining[i]));
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = pt(remaining[bestIdx]);
    route.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return route;
}

// Mejora 2-opt: invierte segmentos mientras acorte la ruta. Cap de pasadas por las dudas.
function twoOpt(origin, route) {
  const n = route.length;
  if (n < 4) return route;
  let best = route.slice();
  let bestLen = routeLength(origin, best);
  let improved = true;
  let passes = 0;
  const MAX_PASSES = 30;

  while (improved && passes < MAX_PASSES) {
    improved = false;
    passes++;
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const candidate = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const len = routeLength(origin, candidate);
        if (len + 1e-9 < bestLen) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

const zonaNombre = (e) => e?.zona?.nombre || "Sin zona";

/**
 * Planifica el orden de visita.
 * @param {{lat:number,lng:number}|null} origin  origen del local (o null)
 * @param {Array} entregas
 * @returns {Array} entregas ordenadas (con coords optimizadas; sin coords al final por zona)
 */
export function planRoute(origin, entregas) {
  const conCoords = entregas.filter(hasCoords);
  const sinCoords = entregas.filter((e) => !hasCoords(e));

  // Si no hay origen configurado, usamos el centroide de las entregas como partida.
  let start = origin;
  if (!start && conCoords.length) {
    const c = conCoords.reduce(
      (acc, e) => ({ lat: acc.lat + Number(e.lat), lng: acc.lng + Number(e.lng) }),
      { lat: 0, lng: 0 }
    );
    start = { lat: c.lat / conCoords.length, lng: c.lng / conCoords.length };
  }

  const optimizadas = start ? twoOpt(start, nearestNeighbor(start, conCoords)) : conCoords;

  // Sin coordenadas: agrupadas por zona (nombre), luego por id.
  const sinOrden = [...sinCoords].sort((a, b) => {
    const za = zonaNombre(a).localeCompare(zonaNombre(b), "es");
    return za !== 0 ? za : Number(a.id) - Number(b.id);
  });

  return [...optimizadas, ...sinOrden];
}

/** Distancia total estimada (km) del tramo con coordenadas, desde el origen. */
export function routeDistanceKm(origin, entregas) {
  const conCoords = entregas.filter(hasCoords);
  if (!conCoords.length) return 0;
  let start = origin;
  if (!start) start = pt(conCoords[0]);
  return routeLength(start, conCoords);
}

/**
 * Links a Google Maps (dir/?api=1, sin API key), en el orden dado. Si hay más de
 * 9 paradas, parte en tramos encadenados (el fin de un tramo es el inicio del siguiente).
 * @returns {string[]} uno o más URLs
 */
export function buildGoogleMapsLinks(origin, entregas) {
  const pts = entregas.filter(hasCoords);
  if (!pts.length) return [];

  const MAX = 9; // paradas por tramo
  const links = [];

  for (let i = 0; i < pts.length; i += MAX) {
    const chunk = pts.slice(i, i + MAX);
    let o;
    let stops;
    if (i === 0) {
      if (origin) {
        o = origin;
        stops = chunk;
      } else {
        o = pt(chunk[0]);
        stops = chunk.slice(1);
      }
    } else {
      o = pt(pts[i - 1]); // encadenar: última parada del tramo anterior
      stops = chunk;
    }
    if (!stops.length) continue;

    const dest = pt(stops[stops.length - 1]);
    const wps = stops.slice(0, -1).map((e) => `${Number(e.lat)},${Number(e.lng)}`);

    const params = new URLSearchParams({
      api: "1",
      travelmode: "driving",
      origin: `${o.lat},${o.lng}`,
      destination: `${dest.lat},${dest.lng}`,
    });
    let url = `https://www.google.com/maps/dir/?${params.toString()}`;
    if (wps.length) url += `&waypoints=${wps.join("%7C")}`;
    links.push(url);
  }
  return links;
}
