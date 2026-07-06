import { useEffect, useState } from "react";
import { MapPinned, Crosshair, Check } from "lucide-react";
import { api } from "../../utils/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

/**
 * Ajustes — origen del local (punto de partida del recorrido) y plantilla de
 * WhatsApp. Persiste en entregas_config (fila única id=1) por api()/transport.
 * El botón "Ubicar" geocodifica la dirección del origen vía /geocode.
 */
export function AjustesManager() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [origenNombre, setOrigenNombre] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [waTemplate, setWaTemplate] = useState("");

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

  useEffect(() => {
    let alive = true;
    api("/config")
      .then((cfg) => {
        if (!alive || !cfg) return;
        setOrigenNombre(cfg.origen_nombre || "");
        setLat(cfg.origen_lat ?? null);
        setLng(cfg.origen_lng ?? null);
        setWaTemplate(cfg.whatsapp_template || "");
      })
      .catch(() => alive && setError("No se pudo cargar la configuración"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function ubicar() {
    const direccion = origenNombre.trim();
    if (!direccion) return;
    setGeoBusy(true);
    setGeoMsg("");
    try {
      const res = await api("/geocode", { method: "POST", body: { direccion } });
      if (res?.geocode_status === "ok" && res.lat != null) {
        setLat(res.lat);
        setLng(res.lng);
        setGeoMsg("Ubicación encontrada ✓");
      } else if (res?.geocode_status === "no_encontrada") {
        setGeoMsg("No se encontró la dirección. Revisá que esté completa.");
      } else {
        setGeoMsg("No se pudo ubicar ahora. Reintentá en un momento.");
      }
    } catch {
      setGeoMsg("No se pudo ubicar (sin conexión).");
    } finally {
      setGeoBusy(false);
    }
  }

  async function guardar() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api("/config", {
        method: "PATCH",
        body: {
          origen_nombre: origenNombre.trim() || null,
          origen_lat: lat,
          origen_lng: lng,
          whatsapp_template: waTemplate,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="px-1 py-6 text-center text-sm text-slate-500">Cargando ajustes…</p>;
  }

  const ubicado = lat != null && lng != null;

  return (
    <div className="flex flex-col gap-4">
      {/* Origen del local */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Origen del local</p>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Punto de partida del recorrido. Se configura una vez.
        </p>

        <label className="mb-1 ml-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Dirección
        </label>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              placeholder="Av. Siempre Viva 742, Springfield"
              value={origenNombre}
              onChange={(e) => {
                setOrigenNombre(e.target.value);
                setGeoMsg("");
              }}
            />
          </div>
          <Button
            variant="secondary"
            onClick={ubicar}
            disabled={geoBusy || !origenNombre.trim()}
            className="min-h-[52px] px-4"
          >
            <Crosshair className="h-4 w-4" />
            {geoBusy ? "Ubicando…" : "Ubicar"}
          </Button>
        </div>

        {geoMsg && <p className="mt-2 text-xs text-slate-500">{geoMsg}</p>}
        {ubicado && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
            <MapPinned className="h-3 w-3" />
            {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
          </p>
        )}
      </div>

      {/* Plantilla de WhatsApp */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Plantilla de WhatsApp
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Variables disponibles: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{"{cliente}"}</code>{" "}
          y <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{"{link}"}</code>.
        </p>
        <textarea
          rows={4}
          value={waTemplate}
          onChange={(e) => setWaTemplate(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
          placeholder="Hola {cliente}! Tu pedido de MG Hogar ya salió 🚚. Seguilo acá: {link}"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button onClick={guardar} disabled={saving}>
        {saved ? (
          <>
            <Check className="h-4 w-4" />
            Guardado
          </>
        ) : saving ? (
          "Guardando…"
        ) : (
          "Guardar ajustes"
        )}
      </Button>
    </div>
  );
}

export default AjustesManager;
