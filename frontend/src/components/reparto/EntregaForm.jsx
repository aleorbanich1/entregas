import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Plus, Check, MapPin, AlertCircle } from "lucide-react";
import { api } from "../../utils/api";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { CalendarPicker } from "../ui/CalendarPicker";
import { cn } from "../../utils/cn";

// Leaflet sólo se descarga si hace falta el fallback de mapa manual.
const MapPicker = lazy(() => import("./MapPicker"));

const FRANJAS = [
  { id: "mañana", label: "Mañana" },
  { id: "tarde", label: "Tarde" },
  { id: "libre", label: "Libre" },
];
// Fallback si todavía no se cargó/creó el catálogo de medios de pago.
const MEDIOS_DEFAULT = ["Efectivo", "Transferencia", "Tarjeta", "MercadoPago", "Otro"];

// Parseo al mediodía para evitar el corrimiento de día (zona -03).
const parseDia = (d) => new Date(`${d}T12:00:00`);
const fmtDia = (d) =>
  parseDia(d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

/**
 * EntregaForm — alta Y edición de entregas, pensada para celular. Todo por api()
 * (encolable offline). Al guardar geocodifica si cambió la dirección; si falla,
 * ofrece marcar en el mapa (geocode_status='manual'). Registra evento en /eventos.
 *
 * - Crear: sin prop `entrega`.
 * - Editar: pasando `entrega` (se precargan los campos y se guarda con PATCH).
 */
export function EntregaForm({ open, onClose, fechaDefault, onCreated, entrega }) {
  const isEdit = !!entrega;
  const [zonas, setZonas] = useState([]);
  const [camiones, setCamiones] = useState([]);
  const [medios, setMedios] = useState([]); // catálogo editable de medios de pago
  const [origen, setOrigen] = useState(null); // centro del mapa (origen del local)

  // Campos
  const [cliente, setCliente] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [zonaId, setZonaId] = useState("");
  const [camionId, setCamionId] = useState("");
  const [fecha, setFecha] = useState(fechaDefault);
  const [showCal, setShowCal] = useState(false);
  const [franja, setFranja] = useState("libre");
  const [hora, setHora] = useState("");
  const [productos, setProductos] = useState("");
  const [monto, setMonto] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [pagado, setPagado] = useState(false);
  const [notas, setNotas] = useState("");

  // Alta de zona inline
  const [addingZona, setAddingZona] = useState(false);
  const [nuevaZona, setNuevaZona] = useState("");

  // Ubicación
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [geoStatus, setGeoStatus] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const revTimer = useRef();
  // Si el usuario escribe un nombre a mano, el reverse-geocode no lo pisa.
  const dirTouched = useRef(false);

  // Al abrir: cargar catálogos y precargar/resetear el formulario.
  useEffect(() => {
    if (!open) return;
    if (entrega) {
      // Modo edición: precargar desde la entrega.
      setCliente(entrega.cliente || "");
      setDireccion(entrega.direccion || "");
      setTelefono(entrega.telefono || "");
      setZonaId(entrega.zona_id != null ? String(entrega.zona_id) : "");
      setCamionId(entrega.camion_id != null ? String(entrega.camion_id) : "");
      setFecha(entrega.fecha_entrega || fechaDefault);
      setFranja(entrega.franja || "libre");
      setHora(entrega.hora_aprox ? String(entrega.hora_aprox).slice(0, 5) : "");
      setProductos(entrega.productos || "");
      setMonto(entrega.monto != null ? String(entrega.monto) : "");
      setMedioPago(entrega.medio_pago || "");
      setPagado(!!entrega.pagado);
      setNotas(entrega.notas || "");
      setLat(entrega.lat ?? null);
      setLng(entrega.lng ?? null);
      setGeoStatus(entrega.geocode_status ?? null);
    } else {
      setCliente(""); setDireccion(""); setTelefono("");
      setZonaId(""); setCamionId("");
      setFecha(fechaDefault);
      setFranja("libre"); setHora("");
      setProductos(""); setMonto(""); setMedioPago(""); setPagado(false); setNotas("");
      setLat(null); setLng(null); setGeoStatus(null);
    }
    setShowCal(false);
    setAddingZona(false); setNuevaZona("");
    setError("");
    dirTouched.current = false;

    let alive = true;
    Promise.allSettled([api("/zonas"), api("/camiones"), api("/config"), api("/medios-pago")]).then(
      ([z, c, cfg, mp]) => {
        if (!alive) return;
        if (z.status === "fulfilled") setZonas((z.value || []).filter((x) => x.activa));
        if (c.status === "fulfilled") setCamiones((c.value || []).filter((x) => x.activo));
        if (cfg.status === "fulfilled" && cfg.value?.origen_lat != null) {
          setOrigen([cfg.value.origen_lat, cfg.value.origen_lng]);
        }
        // Medios de pago activos; si falla o está vacío, se usa el fallback genérico.
        if (mp.status === "fulfilled" && Array.isArray(mp.value)) {
          setMedios(mp.value.filter((x) => x.activo !== false));
        }
      }
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fechaDefault, entrega?.id]);

  async function agregarZona() {
    const nombre = nuevaZona.trim();
    if (!nombre) return;
    try {
      const orden = zonas.length ? Math.max(...zonas.map((z) => z.orden ?? 0)) + 1 : 0;
      const res = await api("/zonas", { method: "POST", body: { nombre, orden } });
      const row = res?.id ? res : { id: `tmp-${Date.now()}`, nombre, orden, activa: true };
      setZonas((prev) => [...prev, row]);
      setZonaId(String(row.id));
      setNuevaZona("");
      setAddingZona(false);
    } catch (e) {
      setError(e?.message || "No se pudo agregar la zona");
    }
  }

  function buildBody(la, ln, status) {
    const dir =
      direccion.trim() ||
      (la != null && ln != null
        ? `Ubicación ${Number(la).toFixed(5)}, ${Number(ln).toFixed(5)}`
        : "");
    return {
      cliente: cliente.trim(),
      direccion: dir,
      telefono: telefono.trim() || null,
      zona_id: zonaId ? Number(zonaId) : null,
      camion_id: camionId ? Number(camionId) : null,
      fecha_entrega: fecha,
      franja,
      hora_aprox: hora || null,
      productos: productos.trim() || null,
      monto: monto ? Number(monto) : 0,
      medio_pago: medioPago || null,
      pagado: !!pagado,
      notas: notas.trim() || null,
      lat: la,
      lng: ln,
      geocode_status: status || "pendiente",
    };
  }

  async function persistir(la, ln, status) {
    setSaving(true);
    setError("");
    try {
      const body = buildBody(la, ln, status);
      let saved;
      if (isEdit) {
        saved = await api(`/entregas/${entrega.id}`, { method: "PATCH", body });
        await api("/eventos", {
          method: "POST",
          body: {
            entrega_id: entrega.id,
            tipo: "editada",
            detalle: `${body.cliente} — ${body.direccion}`,
          },
        });
      } else {
        saved = await api("/entregas", { method: "POST", body });
        // Evento de creación (sólo si ya tenemos id; offline se crea al sincronizar).
        if (saved?.id) {
          await api("/eventos", {
            method: "POST",
            body: {
              entrega_id: saved.id,
              tipo: "creada",
              detalle: `${body.cliente} — ${body.direccion} (${status || "pendiente"})`,
            },
          });
        }
      }
      onCreated?.(saved);
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo guardar la entrega");
    } finally {
      setSaving(false);
    }
  }

  // Marcar la ubicación en el mapa. Traduce el punto a una dirección (reverse).
  function onPin(la, ln) {
    setLat(la);
    setLng(ln);
    setGeoStatus("manual");
    setError("");
    // Al (re)marcar el pin volvemos a permitir que el reverse-geocode sugiera un
    // nombre; si el usuario ya escribió uno a mano, se respeta.
    dirTouched.current = false;
    clearTimeout(revTimer.current);
    revTimer.current = setTimeout(async () => {
      try {
        const res = await api("/geocode", { method: "POST", body: { lat: la, lng: ln } });
        if (res?.direccion && !dirTouched.current) {
          setDireccion(res.direccion);
          setGeoStatus("ok");
        }
      } catch {
        // sin reverse igual guardamos con las coordenadas
      }
    }, 600);
  }

  async function guardar() {
    if (!cliente.trim()) {
      setError("Poné el nombre del cliente.");
      return;
    }
    if (lat == null || lng == null) {
      setError("Marcá la ubicación en el mapa.");
      return;
    }
    setError("");
    return persistir(lat, lng, geoStatus || "manual");
  }

  const pinPuesto = lat != null && lng != null;

  // Opciones de medio de pago: catálogo activo (o fallback). Si la entrega ya tenía
  // un medio que quedó inactivo/borrado, lo mostramos igual para no perderlo.
  const medioOpciones = (() => {
    const base = medios.length ? medios.map((m) => m.nombre) : MEDIOS_DEFAULT;
    return medioPago && !base.includes(medioPago) ? [medioPago, ...base] : base;
  })();

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? "Editar entrega" : "Nueva entrega"}
    >
        <div className="flex flex-col gap-3">
          <Field label="Cliente" required>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" autoFocus />
          </Field>

          {/* Ubicación: se marca en el mapa; la dirección se autocompleta por reverse
              y se puede editar a mano (nombre propio) sin que eso busque en el mapa */}
          <Field label="Ubicación" required>
            <p className="mb-2 text-xs text-slate-500">
              Tocá el mapa (o arrastrá el pin) para marcar dónde es la entrega.
            </p>
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  Cargando mapa…
                </div>
              }
            >
              <MapPicker lat={lat} lng={lng} center={origen} onChange={onPin} />
            </Suspense>
            {pinPuesto && (
              <div className="mt-3">
                <label className="mb-1 ml-1 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                  Nombre de esta ubicación
                </label>
                <Input
                  value={direccion}
                  onChange={(e) => {
                    setDireccion(e.target.value);
                    dirTouched.current = true; // el usuario mandó: no lo pisamos
                  }}
                  placeholder="Detectando dirección…"
                />
                <p className="mt-1 ml-1 text-xs text-slate-400">
                  Podés escribir un nombre propio (ej: “Depósito López”, “Casa fondo verde”). El pin
                  ya define la ubicación; esto es sólo cómo se ve en la app y el PDF.
                </p>
              </div>
            )}
          </Field>

          <Field label="Teléfono">
            <Input
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Opcional"
            />
          </Field>

          {/* Zona + agregar inline */}
          <Field label="Zona">
            {addingZona ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={nuevaZona}
                  onChange={(e) => setNuevaZona(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregarZona()}
                  placeholder="Nueva zona"
                />
                <Button size="sm" onClick={agregarZona} disabled={!nuevaZona.trim()} className="min-h-[52px]">
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                    <option value="">— Sin zona —</option>
                    {zonas.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddingZona(true)}
                  className="min-h-[52px]"
                  aria-label="Agregar zona"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Field>

          {/* Camión (opcional) */}
          <Field label="Camión (opcional)">
            <Select value={camionId} onChange={(e) => setCamionId(e.target.value)}>
              <option value="">— Sin camión —</option>
              {camiones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.patente ? ` (${c.patente})` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {/* Fecha */}
          <Field label="Fecha de entrega">
            <button
              type="button"
              onClick={() => setShowCal((v) => !v)}
              className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm capitalize text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            >
              {fmtDia(fecha)}
              <span className="text-xs text-slate-400">{showCal ? "Cerrar" : "Cambiar"}</span>
            </button>
            {showCal && (
              <div className="mt-2">
                <CalendarPicker
                  selectedDate={fecha}
                  onSelectDate={(d) => {
                    setFecha(d);
                    setShowCal(false);
                  }}
                />
              </div>
            )}
          </Field>

          {/* Franja + hora */}
          <Field label="Franja horaria">
            <div className="flex gap-2">
              {FRANJAS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFranja(f.id)}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors",
                    franja === f.id
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/25 dark:text-emerald-400"
                      : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Hora aproximada">
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Field>

          <Field label="Productos">
            <textarea
              rows={2}
              value={productos}
              onChange={(e) => setProductos(e.target.value)}
              placeholder="Qué se entrega"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
            />
          </Field>

          {/* Monto + medio + pagado */}
          <Field label="Monto y pago">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="$ 0"
                />
              </div>
              <div className="flex-1">
                <Select value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                  <option value="">Medio de pago</option>
                  {medioOpciones.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={pagado}
                onChange={(e) => setPagado(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
              />
              Ya está pago
            </label>
          </Field>

          <Field label="Notas">
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Referencias, timbre, etc."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
            />
          </Field>

          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} /> {error}
            </p>
          )}

          <Button onClick={guardar} disabled={saving} className="mt-1">
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar entrega"}
          </Button>
        </div>
    </Modal>
  );
}

// Etiqueta + control, compacto para mobile.
function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 ml-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export default EntregaForm;
