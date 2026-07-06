import { useState } from "react";
import { format, addDays } from "date-fns";
import {
  MapPin,
  MessageCircle,
  Truck,
  Check,
  X,
  CalendarClock,
  Clock,
  Package,
  StickyNote,
} from "lucide-react";
import { api } from "../../utils/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { CalendarPicker } from "../ui/CalendarPicker";
import { cn } from "../../utils/cn";

const manana = () => format(addDays(new Date(), 1), "yyyy-MM-dd");
const parseDia = (d) => new Date(`${d}T12:00:00`);

const ESTADO_META = {
  pendiente: { label: "Pendiente", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  en_camino: { label: "En camino", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400" },
  entregado: { label: "Entregado", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400" },
  no_entregado: { label: "No entregado", cls: "bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400" },
  reprogramado: { label: "Reprogramado", cls: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" },
};

const fmtMonto = (m) =>
  Number(m || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * EntregaCard — tarjeta operativa del repartidor. Fallos defensivos: todo lo que
 * viene de la entrega (incluida realtime) se lee con optional chaining.
 */
export function EntregaCard({ entrega, config, onChanged, onStartTracking }) {
  const [modal, setModal] = useState(null); // null | 'no_entregado' | 'reprogramar'
  const [motivo, setMotivo] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState(manana());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const estado = entrega?.estado || "pendiente";
  const meta = ESTADO_META[estado] || ESTADO_META.pendiente;
  const pagado = !!entrega?.pagado;
  const enCamino = estado === "en_camino";
  const avisado = !!entrega?.avisado;

  async function cambiarEstado(nuevo, extra = {}, detalle = "") {
    setBusy(true);
    setError("");
    onChanged?.({ ...entrega, estado: nuevo, ...extra });
    try {
      await api(`/entregas/${entrega.id}`, { method: "PATCH", body: { estado: nuevo, ...extra } });
      await api("/eventos", {
        method: "POST",
        body: { entrega_id: entrega.id, tipo: nuevo, detalle: detalle || null },
      });
    } catch (e) {
      setError(e?.message || "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  async function enCaminoAction() {
    await cambiarEstado("en_camino");
    onStartTracking?.(); // arranca el watchPosition del camión de hoy
  }

  async function confirmarNoEntregado() {
    const m = motivo.trim();
    if (!m) return;
    setModal(null);
    await cambiarEstado("no_entregado", { motivo_no_entregado: m }, m);
    setMotivo("");
  }

  async function confirmarReprogramar() {
    setModal(null);
    await cambiarEstado("reprogramado", { fecha_entrega: nuevaFecha }, `→ ${nuevaFecha}`);
  }

  async function whatsapp() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/seguir/${entrega?.tracking_token || ""}`;
    const tel = String(entrega?.telefono || "").replace(/\D/g, "");
    const tpl =
      config?.whatsapp_template ||
      "Hola {cliente}! Tu pedido de MG Hogar ya salió 🚚. Seguilo acá: {link}";
    const text = tpl.replaceAll("{cliente}", entrega?.cliente || "").replaceAll("{link}", link);
    if (typeof window !== "undefined") {
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
    onChanged?.({ ...entrega, avisado: true });
    try {
      await api(`/entregas/${entrega.id}`, { method: "PATCH", body: { avisado: true } });
      await api("/eventos", {
        method: "POST",
        body: { entrega_id: entrega.id, tipo: "avisado", detalle: "WhatsApp" },
      });
    } catch {
      // no crítico
    }
  }

  function abrirMapa() {
    const dest =
      entrega?.lat != null && entrega?.lng != null
        ? `${entrega.lat},${entrega.lng}`
        : encodeURIComponent(entrega?.direccion || "");
    if (typeof window !== "undefined") {
      window.open(
        `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest}`,
        "_blank",
        "noopener"
      );
    }
  }

  const terminado = estado === "entregado" || estado === "no_entregado";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Encabezado */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">
              {entrega?.cliente || "Sin nombre"}
            </h3>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", meta.cls)}>
              {meta.label}
            </span>
          </div>
          <button
            onClick={abrirMapa}
            className="mt-0.5 flex items-start gap-1 text-left text-sm text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{entrega?.direccion || "Sin dirección"}</span>
          </button>
        </div>
        <button
          onClick={abrirMapa}
          className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          aria-label="Abrir en el mapa"
        >
          <MapPin className="h-4 w-4" />
        </button>
      </div>

      {/* Metadatos */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 capitalize">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          {entrega?.franja || "libre"}
          {entrega?.hora_aprox ? ` · ${String(entrega.hora_aprox).slice(0, 5)}` : ""}
        </span>
        {/* Monto */}
        {pagado ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
            Pagado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            A cobrar ${fmtMonto(entrega?.monto)}
          </span>
        )}
      </div>

      {entrega?.productos && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0">{entrega.productos}</span>
        </p>
      )}
      {entrega?.notas && (
        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0">{entrega.notas}</span>
        </p>
      )}

      {/* Recordatorio: en camino y sin avisar */}
      {enCamino && !avisado && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <MessageCircle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">Avisá al cliente que su pedido salió</span>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Acciones */}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* WhatsApp */}
        <Button
          variant={enCamino && !avisado ? "primary" : "secondary"}
          size="sm"
          onClick={whatsapp}
          className={cn(enCamino && !avisado && "bg-emerald-600")}
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </Button>

        {!enCamino && !terminado && (
          <Button size="sm" onClick={enCaminoAction} disabled={busy}>
            <Truck className="h-4 w-4" />
            En camino
          </Button>
        )}

        {enCamino && (
          <>
            <Button size="sm" onClick={() => cambiarEstado("entregado")} disabled={busy}>
              <Check className="h-4 w-4" />
              Entregado
            </Button>
            <Button variant="danger" size="sm" onClick={() => setModal("no_entregado")} disabled={busy}>
              <X className="h-4 w-4" />
              No entregado
            </Button>
          </>
        )}

        {/* Reprogramar disponible salvo cuando ya está entregado */}
        {estado !== "entregado" && (
          <Button variant="secondary" size="sm" onClick={() => setModal("reprogramar")} disabled={busy}>
            <CalendarClock className="h-4 w-4" />
            Reprogramar
          </Button>
        )}
      </div>

      {/* Modal: motivo no entregado */}
      <Modal isOpen={modal === "no_entregado"} onClose={() => setModal(null)} title="No entregado">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            ¿Por qué no se pudo entregar?
          </label>
          <textarea
            autoFocus
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: no había nadie, dirección incorrecta…"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
          <Button variant="danger" onClick={confirmarNoEntregado} disabled={!motivo.trim()}>
            Confirmar no entregado
          </Button>
        </div>
      </Modal>

      {/* Modal: reprogramar */}
      <Modal isOpen={modal === "reprogramar"} onClose={() => setModal(null)} title="Reprogramar entrega">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Nueva fecha (reaparece sola ese día):
          </p>
          <p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-50">
            {parseDia(nuevaFecha).toLocaleDateString("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <CalendarPicker selectedDate={nuevaFecha} onSelectDate={setNuevaFecha} />
          <Button onClick={confirmarReprogramar}>Confirmar nueva fecha</Button>
        </div>
      </Modal>
    </div>
  );
}

export default EntregaCard;
