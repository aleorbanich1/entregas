import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION } from "../../utils/config";

// Marcador del camión (divIcon emerald). Sin interacción: es solo lectura.
const truckIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#059669;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
  </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

/** Mapa Leaflet de solo lectura que muestra (y sigue) la posición del camión. */
export function SeguirMapa({ lat, lng }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // Init una sola vez.
  useEffect(() => {
    if (mapRef.current || !elRef.current || lat == null || lng == null) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(
      [lat, lng],
      15
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    markerRef.current = L.marker([lat, lng], { icon: truckIcon }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar posición cuando cambian las coords (poll cada ~30s).
  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return;
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    mapRef.current.panTo([lat, lng]);
  }, [lat, lng]);

  return (
    <div
      ref={elRef}
      className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
      style={{ isolation: "isolate", zIndex: 0 }}
    />
  );
}

export default SeguirMapa;
