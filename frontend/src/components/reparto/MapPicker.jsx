import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION } from "../../utils/config";

// Pin propio (divIcon) para evitar el problema de rutas de íconos de Leaflet con
// bundlers. Emerald, coherente con la paleta.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#059669" stroke="#ffffff" stroke-width="1.5"><path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z"/><circle cx="12" cy="11" r="2.2" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 29],
});

const DEFAULT_CENTER = [-34.6037, -58.3816]; // Buenos Aires (fallback)

/**
 * MapPicker — mapa Leaflet para marcar una ubicación a mano. Click o arrastre del
 * pin → onChange(lat, lng). Atribución "© OpenStreetMap contributors" obligatoria.
 */
export function MapPicker({ lat, lng, center, onChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;

    const start =
      lat != null && lng != null ? [lat, lng] : center || DEFAULT_CENTER;
    const map = L.map(elRef.current, { attributionControl: true }).setView(
      start,
      lat != null && lng != null ? 16 : 13
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    const place = (la, ln, fly) => {
      if (!markerRef.current) {
        markerRef.current = L.marker([la, ln], {
          icon: pinIcon,
          draggable: true,
        }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current.getLatLng();
          onChangeRef.current?.(p.lat, p.lng);
        });
      } else {
        markerRef.current.setLatLng([la, ln]);
      }
      if (fly) map.panTo([la, ln]);
    };

    if (lat != null && lng != null) place(lat, lng, false);

    // Sin punto previo ni centro: arrancar cerca de la ubicación del dispositivo.
    if (lat == null && lng == null && !center && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const la = pos?.coords?.latitude;
          const ln = pos?.coords?.longitude;
          // sólo recentrar si el usuario todavía no marcó nada
          if (mapRef.current && !markerRef.current && la != null && ln != null) {
            mapRef.current.setView([la, ln], 15);
          }
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    }

    map.on("click", (e) => {
      const { lat: la, lng: ln } = e.latlng;
      place(la, ln, false);
      onChangeRef.current?.(la, ln);
    });

    mapRef.current = map;
    // El mapa se monta dentro de un modal: recalcular tamaño tras el layout.
    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={elRef}
      className="h-64 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
      style={{ isolation: "isolate", zIndex: 0 }}
    />
  );
}

export default MapPicker;
