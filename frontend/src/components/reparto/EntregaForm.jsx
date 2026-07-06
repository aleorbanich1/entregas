import { useEffect, useState, lazy, Suspense } from "react";
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
const MEDIOS = ["Efectivo", "Transferencia", "Tarjeta", "MercadoPago", "Otro"];

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

  const [step, setStep] = useState("form"); // 'form' | 'map'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    setStep("form"); setError("");

    let alive = true;
    Promise.allSettled([api("/zonas"), api("/camiones"), api("/config")]).then(
      ([z, c, cfg]) => {
        if (!alive) return;
        if (z.status === "fulfilled") setZonas((z.value || []).filter((x) => x.activa));
        if (c.status === "fulfilled") setCamiones((c.value || []).filter((x) => x.activo));
        if (cfg.status === "fulfilled" && cfg.value?.origen_lat != null) {
          setOrigen([cfg.value.origen_lat, cfg.value.origen_lng]);
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
    return {
      cliente: cliente.trim(),
      direccion: direccion.trim(),
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

  async function guardar() {
    if (!cliente.trim() || !direccion.trim()) {
      setError("Cliente y dirección son obligatorios.");
      return;
    }
    setError("");

    // Editando y la dirección no cambió: conservamos las coordenadas, no re-geocodificamos.
    if (isEdit && direccion.trim() === (entrega.direccion || "").trim()) {
      return persistir(lat, lng, geoStatus || "pendiente");
    }

    // Si ya se marcó a mano, no volvemos a geocodificar.
    if (geoStatus === "manual" && lat != null) return persistir(lat, lng, "manual");

    setSaving(true);
    try {
      const res = await api("/geocode", { method: "POST", body: { direccion: direccion.trim() } });
      if (res?.geocode_status === "ok" && res.lat != null) {
        setLat(res.lat);
        setLng(res.lng);
        setGeoStatus("ok");
        setSaving(false);
        return persistir(res.lat, res.lng, "ok");
      }
      // No encontrada → ir al mapa para marcar a mano.
      setGeoStatus(res?.geocode_status || "fallo");
      setSaving(false);
      setStep("map");
    } catch {
      // Offline o error de la función → fallback manual.
      setGeoStatus("fallo");
      setSaving(false);
      setStep("map");
    }
  }

  const pinPuesto = lat != null && lng != null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={step === "map" ? "Marcar ubicación" : isEdit ? "Editar entrega" : "Nueva entrega"}
    >
      {step === "map" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm">
              No pudimos ubicar la dirección automáticamente. Tocá el mapa para marcar
              dónde es (se guarda como ubicación manual).
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                Cargando mapa…
              </div>
            }
          >
            <MapPicker
              lat={lat}
              lng={lng}
              center={origen}
              onChange={(la, ln) => {
                setLat(la);
                setLng(ln);
                setGeoStatus("manual");
              }}
            />
          </Suspense>

          {pinPuesto && (
            <p className="inline-flex items-center gap-1 self-start rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
              <MapPin className="h-3 w-3" />
              {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
            </p>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={() => persistir(lat, lng, "manual")} disabled={saving || !pinPuesto}>
              {saving ? "Guardando…" : "Confirmar ubicación y guardar"}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep("form")} disabled={saving}>
                Volver
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => persistir(null, null, "fallo")}
                disabled={saving}
              >
                Guardar sin ubicación
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Cliente" required>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" autoFocus />
          </Field>

          <Field label="Dirección" required>
            <Input
              value={direccion}
              onChange={(e) => {
                setDireccion(e.target.value);
                if (geoStatus) setGeoStatus(null);
              }}
              placeholder="Calle 123, Localidad"
            />
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
                  {MEDIOS.map((m) => (
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
      )}
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
