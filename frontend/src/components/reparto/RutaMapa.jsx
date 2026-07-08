import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION } from "../../utils/config";

const DEFAULT_CENTER = [-34.9, -57.95]; // La Plata aprox (fallback)

function numberIcon(n) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#059669;color:#fff;font:700 12px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}
const origenIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#0f172a;color:#fff;font:700 11px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">🏠</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/**
 * RutaMapa — muestra TODAS las paradas del día numeradas (solo lectura), más el
 * origen del local. Para que el repartidor vea el recorrido completo de un vistazo.
 */
export function RutaMapa({ paradas, origen }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { attributionControl: true }).setView(DEFAULT_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    const pts = [];
    if (origen?.lat != null && origen?.lng != null) {
      L.marker([origen.lat, origen.lng], { icon: origenIcon }).addTo(map);
      pts.push([origen.lat, origen.lng]);
    }
    (paradas || []).forEach((p, i) => {
      if (p?.lat == null || p?.lng == null) return;
      L.marker([p.lat, p.lng], { icon: numberIcon(i + 1) })
        .addTo(map)
        .bindPopup(`${i + 1}. ${p.cliente || ""}`);
      pts.push([p.lat, p.lng]);
    });

    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={elRef}
      className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
      style={{ isolation: "isolate", zIndex: 0 }}
    />
  );
}

export default RutaMapa;
