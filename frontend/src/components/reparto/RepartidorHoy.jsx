import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  Truck,
  Radio,
  Power,
  PackagePlus,
  RefreshCw,
  Map as MapIcon,
  ExternalLink,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Package,
} from "lucide-react";
import { api, socket } from "../../utils/api";
import { startTracking, stopTracking, isTracking } from "../../utils/tracking";
import { buildGoogleMapsLinks } from "../../utils/ruta";
import { fmtARS } from "../../utils/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { EntregaCard } from "./EntregaCard";
import { EntregaForm } from "./EntregaForm";

// Leaflet sólo se descarga si el repartidor abre el mapa de la ruta.
const RutaMapa = lazy(() => import("./RutaMapa"));

const hoy = () => format(new Date(), "yyyy-MM-dd");
const CAMION_KEY = "mg_reparto_camion_hoy";
const sortByOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id);

function readCamionHoy() {
  try {
    const raw = JSON.parse(localStorage.getItem(CAMION_KEY) || "null");
    return raw && raw.fecha === hoy() ? String(raw.camionId) : "";
  } catch {
    return "";
  }
}

/**
 * RepartidorHoy — home operativo del repartidor: elige su camión de hoy y trabaja
 * la hoja publicada como tarjetas. Consume realtime con fallos defensivos.
 */
export function RepartidorHoy() {
  const fecha = hoy();
  const [camiones, setCamiones] = useState([]);
  const [camionHoy, setCamionHoy] = useState(readCamionHoy);
  const [pick, setPick] = useState(""); // selección temporal antes de "Empezar"
  const [config, setConfig] = useState(null);

  const [entregas, setEntregas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(isTracking());
  const [geoMsg, setGeoMsg] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Revisión antes de empezar el día + animación de arranque.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewList, setReviewList] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [showStart, setShowStart] = useState(false);

  // Origen del local y link(s) de Google Maps con el recorrido completo.
  const origen =
    config?.origen_lat != null && config?.origen_lng != null
      ? { lat: Number(config.origen_lat), lng: Number(config.origen_lng) }
      : null;
  const gmapsLinks = useMemo(() => buildGoogleMapsLinks(origen, entregas), [origen, entregas]);
  const conCoords = entregas.filter((e) => e?.lat != null && e?.lng != null).length;

  // Catálogos.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([api("/camiones"), api("/config")]).then(([c, cfg]) => {
      if (!alive) return;
      if (c.status === "fulfilled") setCamiones((c.value || []).filter((x) => x?.activo));
      if (cfg.status === "fulfilled") setConfig(cfg.value || null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const cargar = useMemo(
    () => () => {
      if (!camionHoy) return;
      setLoading(true);
      setError("");
      api(`/entregas?fecha=${fecha}&camion_id=${camionHoy}`)
        .then((data) => setEntregas((data || []).slice().sort(sortByOrden)))
        .catch(() => setError("No se pudieron cargar las entregas"))
        .finally(() => setLoading(false));
    },
    [camionHoy, fecha]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Realtime: mantener la lista al día (defensivo con optional chaining).
  useEffect(() => {
    if (!camionHoy) return;

    const upsert = (e) => {
      if (!e?.id) return;
      const esDeHoy = e?.fecha_entrega === fecha && Number(e?.camion_id) === Number(camionHoy);
      setEntregas((prev) => {
        const existe = prev.some((x) => Number(x?.id) === Number(e.id));
        if (existe) {
          // Si ya está en la lista, la actualizamos en el lugar (aunque la hayan
          // reprogramado): queda tachada con opción de restaurar hasta refrescar.
          return prev.map((x) => (Number(x?.id) === Number(e.id) ? { ...x, ...e } : x)).sort(sortByOrden);
        }
        return esDeHoy ? [...prev, e].sort(sortByOrden) : prev;
      });
    };
    const remove = (p) => {
      const id = p?.id;
      if (id == null) return;
      setEntregas((prev) => prev.filter((x) => Number(x?.id) !== Number(id)));
    };

    socket.on("ENTREGA_UPDATED", upsert);
    socket.on("ENTREGA_CREATED", upsert);
    socket.on("ENTREGA_DELETED", remove);
    return () => {
      socket.off("ENTREGA_UPDATED", upsert);
      socket.off("ENTREGA_CREATED", upsert);
      socket.off("ENTREGA_DELETED", remove);
    };
  }, [camionHoy, fecha]);

  function elegirCamion(id) {
    if (!id) return;
    setCamionHoy(String(id));
    try {
      localStorage.setItem(CAMION_KEY, JSON.stringify({ fecha, camionId: String(id) }));
    } catch {
      // no crítico
    }
  }

  // Abre la revisión: trae las entregas del camión elegido para chequearlas.
  async function abrirRevision() {
    if (!pick) return;
    setReviewOpen(true);
    setReviewChecked(false);
    setReviewLoading(true);
    try {
      const data = await api(`/entregas?fecha=${fecha}&camion_id=${pick}`);
      setReviewList((data || []).slice().sort(sortByOrden));
    } catch {
      setReviewList([]);
    } finally {
      setReviewLoading(false);
    }
  }

  // Confirmar: arranca el día + animación.
  function confirmarInicio() {
    setReviewOpen(false);
    elegirCamion(pick);
    setShowStart(true);
    setTimeout(() => setShowStart(false), 1700);
  }

  // Modal de revisión: obliga a chequear la ruta antes de empezar.
  function renderRevision() {
    return (
      <Modal isOpen={reviewOpen} onClose={() => setReviewOpen(false)} title="Revisá tu ruta">
        <div className="flex flex-col gap-3">
          {!reviewLoading && reviewList.length > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Chequeá el orden, las direcciones y los datos de cada entrega antes de salir.
            </p>
          )}

          {reviewLoading ? (
            <p className="py-4 text-center text-sm text-slate-500">Cargando…</p>
          ) : reviewList.length === 0 ? null : (
            <ul className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
              {reviewList.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white dark:bg-emerald-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                      {e.cliente}
                    </p>
                    <p className="flex items-start gap-1 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="min-w-0">{e.direccion}</span>
                    </p>
                    {e.productos && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <Package className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                        <span className="min-w-0">{e.productos}</span>
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {e.franja || "libre"}
                        {e.hora_aprox ? ` · ${String(e.hora_aprox).slice(0, 5)}` : ""}
                      </span>
                      <span
                        className={
                          e.pagado
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400"
                            : "rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                        }
                      >
                        {e.pagado ? "Pagado" : `A cobrar ${fmtARS(e.monto)}`}
                      </span>
                      {e.lat == null && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                          sin ubicación
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Sin entregas: no se puede empezar el día. Mensaje claro y salida. */}
          {!reviewLoading && reviewList.length === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">¿Empezar el día sin entregas?</p>
                  <p className="mt-1">
                    Este camión no tiene ninguna entrega para hoy. Fijate si cargaste las entregas
                    para el día de hoy (y no para otro día). Cuando haya al menos una entrega vas a
                    poder empezar.
                  </p>
                  <p className="mt-1 font-semibold">No se puede empezar el día sin entregas.</p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => setReviewOpen(false)}>
                Entendido
              </Button>
            </div>
          ) : !reviewLoading ? (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={reviewChecked}
                  onChange={(e) => setReviewChecked(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                />
                Revisé la ruta y los datos están bien.
              </label>

              <Button onClick={confirmarInicio} disabled={!reviewChecked}>
                Confirmar y empezar
              </Button>
            </>
          ) : null}
        </div>
      </Modal>
    );
  }

  // Animación de arranque (liviana: sólo transform/opacity).
  function renderArranque() {
    return (
      <AnimatePresence>
        {showStart && (
          <motion.div
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-emerald-600 text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 11, stiffness: 200 }}
            >
              <CheckCircle2 className="h-24 w-24" strokeWidth={2.5} />
            </motion.div>
            <motion.p
              className="mt-4 text-2xl font-bold"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.3 }}
            >
              ¡A repartir!
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  function iniciarTracking() {
    setGeoMsg("");
    const ok = startTracking(
      camionHoy,
      () => setTracking(true),
      (err) => {
        setTracking(isTracking());
        setGeoMsg(
          err === "sin_geolocalizacion"
            ? "Este dispositivo no tiene geolocalización."
            : "No pudimos acceder a la ubicación. Revisá los permisos."
        );
      }
    );
    if (ok) setTracking(true);
  }

  function cerrarDia() {
    stopTracking();
    setTracking(false);
    setCamionHoy("");
    setPick("");
    try {
      localStorage.removeItem(CAMION_KEY);
    } catch {
      // no crítico
    }
  }

  const mergeLocal = (updated) =>
    setEntregas((prev) =>
      prev.map((x) => (Number(x?.id) === Number(updated?.id) ? { ...x, ...updated } : x)).sort(sortByOrden)
    );

  const camionActual = camiones.find((c) => Number(c?.id) === Number(camionHoy));

  // ── Selección de camión del día ──
  if (!camionHoy) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
            <Truck className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Tu camión de hoy</p>
        </div>
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Elegí un camión</option>
          {camiones.map((c) => (
            <option key={c.id} value={c.id}>
              {c?.nombre}
              {c?.patente ? ` (${c.patente})` : ""}
            </option>
          ))}
        </Select>
        <Button className="mt-3 w-full" onClick={abrirRevision} disabled={!pick}>
          Empezar el día
        </Button>
        {camiones.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            No hay camiones activos. Pedí que creen uno en la pestaña Camiones.
          </p>
        )}

        {renderRevision()}
        {renderArranque()}
      </div>
    );
  }

  // ── Home operativo ──
  return (
    <div className="flex flex-col gap-4">
      {/* Barra de camión + estado de seguimiento */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
          <Truck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
            {camionActual?.nombre || "Camión"}
          </p>
          <p className="flex items-center gap-1 text-xs">
            {tracking ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Radio className="h-3 w-3 animate-pulse" /> Publicando ubicación
              </span>
            ) : (
              <span className="text-slate-400">Seguimiento detenido</span>
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={cerrarDia}>
          <Power className="h-4 w-4" />
          Cerrar día
        </Button>
      </div>

      {geoMsg && <p className="text-sm text-amber-600 dark:text-amber-400">{geoMsg}</p>}

      {/* Acciones */}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setFormOpen(true)}>
          <PackagePlus className="h-4 w-4" />
          Entrega de último momento
        </Button>
        <Button variant="ghost" size="sm" onClick={cargar} aria-label="Refrescar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Mapa de la ruta + Google Maps */}
      {entregas.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" className="w-full" onClick={() => setShowMap((v) => !v)}>
            <MapIcon className="h-4 w-4" />
            {showMap ? "Ocultar mapa" : "Ver mapa"}
          </Button>
          {gmapsLinks.length > 0 && (
            <a href={gmapsLinks[0]} target="_blank" rel="noopener noreferrer">
              <Button className="w-full">
                <ExternalLink className="h-4 w-4" />
                Ver ruta completa en Google Maps
              </Button>
            </a>
          )}
          {gmapsLinks.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {gmapsLinks.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">
                    Tramo {i + 1}
                  </Button>
                </a>
              ))}
            </div>
          )}
          {showMap && (
            <Suspense
              fallback={
                <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  Cargando mapa…
                </div>
              }
            >
              <RutaMapa
                paradas={entregas.map((e) => ({
                  id: e.id,
                  lat: e.lat,
                  lng: e.lng,
                  cliente: e.cliente,
                }))}
                origen={origen}
              />
            </Suspense>
          )}
          {conCoords < entregas.length && (
            <p className="text-xs text-slate-400">
              {entregas.length - conCoords} entrega(s) sin ubicación no aparecen en el mapa.
            </p>
          )}
        </div>
      )}

      {/* Tarjetas */}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando tu hoja…</p>
      ) : entregas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No hay entregas para hoy en este camión.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entregas.map((e) => (
            <EntregaCard
              key={e.id}
              entrega={e}
              config={config}
              onChanged={mergeLocal}
              onStartTracking={iniciarTracking}
              fechaHoy={fecha}
            />
          ))}
        </div>
      )}

      <EntregaForm
        open={formOpen}
        fechaDefault={fecha}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          cargar();
        }}
      />

      {renderArranque()}
    </div>
  );
}

export default RepartidorHoy;
