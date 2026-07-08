import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION } from "../../utils/config";

const truckIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#059669;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
  </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});
const casaIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:#0f172a;color:#fff;font-size:15px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">🏠</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/**
 * SeguirMapa (solo lectura) — muestra la casa del cliente (fija) y el camión
 * (se actualiza). Encuadra ambos puntos.
 */
export function SeguirMapa({ camion, destino }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const truckRef = useRef(null);

  // Init una sola vez.
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const first =
      destino?.lat != null ? [destino.lat, destino.lng] : camion?.lat != null ? [camion.lat, camion.lng] : [-34.9, -57.95];
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(first, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    if (destino?.lat != null && destino?.lng != null) {
      L.marker([destino.lat, destino.lng], { icon: casaIcon }).addTo(map).bindPopup("Tu domicilio");
    }
    if (camion?.lat != null && camion?.lng != null) {
      truckRef.current = L.marker([camion.lat, camion.lng], { icon: truckIcon }).addTo(map);
    }

    fit(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
      truckRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mover el camión cuando llega una posición nueva (poll ~30s).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || camion?.lat == null || camion?.lng == null) return;
    if (truckRef.current) truckRef.current.setLatLng([camion.lat, camion.lng]);
    else truckRef.current = L.marker([camion.lat, camion.lng], { icon: truckIcon }).addTo(map);
    fit(map);
  }, [camion?.lat, camion?.lng]);

  function fit(map) {
    const pts = [];
    if (destino?.lat != null && destino?.lng != null) pts.push([destino.lat, destino.lng]);
    if (camion?.lat != null && camion?.lng != null) pts.push([camion.lat, camion.lng]);
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }

  return (
    <div
      ref={elRef}
      className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
      style={{ isolation: "isolate", zIndex: 0 }}
    />
  );
}

export default SeguirMapa;
