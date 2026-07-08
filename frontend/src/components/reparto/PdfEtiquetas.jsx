import { useMemo, useState } from "react";
import { FileDown, Plus, Trash2, X, Wand2, AlertCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";
import { generarYDescargar, ESCALA_MAX, ESCALA_MIN } from "../../utils/pdfEtiquetas";

let _uid = 0;
const nuevaHoja = () => ({ uid: ++_uid, ids: [], escala: 1 });

// Etiqueta legible de la escala según el layout.
function escalaLabel(escala) {
  if (escala <= 0.85) return "Chico";
  if (escala >= 1.25) return "Grande";
  return "Mediano";
}

/**
 * PdfEtiquetas — configurador del PDF de etiquetas/comprobantes.
 * Recibe las entregas actualmente listadas y deja armar hojas A4: en cada hoja
 * se eligen hasta 4 entregas (la A4 se divide en partes iguales) y una escala de
 * tamaño. Las entregas ya usadas salen del pool. Genera y descarga el PDF.
 */
export function PdfEtiquetas({ open, onClose, entregas = [] }) {
  const [campos, setCampos] = useState({ productos: true, pago: true, logistica: true });
  const [hojas, setHojas] = useState([nuevaHoja()]);
  const [pickerHoja, setPickerHoja] = useState(null); // uid de la hoja abriendo el picker
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  const byId = useMemo(() => {
    const m = new Map();
    for (const e of entregas) m.set(String(e.id), e);
    return m;
  }, [entregas]);

  // Ids ya asignados a alguna hoja.
  const asignados = useMemo(() => new Set(hojas.flatMap((h) => h.ids)), [hojas]);
  const disponibles = useMemo(
    () => entregas.filter((e) => !asignados.has(String(e.id))),
    [entregas, asignados]
  );

  const totalEnHojas = asignados.size;

  function cerrar() {
    onClose?.();
  }

  function addHoja() {
    setHojas((hs) => [...hs, nuevaHoja()]);
  }

  function removeHoja(uid) {
    setHojas((hs) => (hs.length === 1 ? [nuevaHoja()] : hs.filter((h) => h.uid !== uid)));
  }

  function addEntrega(uid, id) {
    setHojas((hs) =>
      hs.map((h) => (h.uid === uid && h.ids.length < 4 ? { ...h, ids: [...h.ids, String(id)] } : h))
    );
    setPickerHoja(null);
  }

  function removeEntrega(uid, id) {
    setHojas((hs) => hs.map((h) => (h.uid === uid ? { ...h, ids: h.ids.filter((x) => x !== id) } : h)));
  }

  function setEscala(uid, escala) {
    setHojas((hs) => hs.map((h) => (h.uid === uid ? { ...h, escala } : h)));
  }

  // Reparte automáticamente TODAS las disponibles de a `n` por hoja (agrega hojas
  // nuevas y conserva las que ya tenían entregas asignadas).
  function autoRepartir(n) {
    if (!disponibles.length) return;
    const pool = disponibles.map((e) => String(e.id));
    const nuevas = [];
    for (let i = 0; i < pool.length; i += n) {
      nuevas.push({ uid: ++_uid, ids: pool.slice(i, i + n), escala: 1 });
    }
    setHojas((hs) => [...hs.filter((h) => h.ids.length > 0), ...nuevas]);
  }

  async function descargar() {
    setError("");
    const plan = hojas
      .filter((h) => h.ids.length > 0)
      .map((h) => ({
        escala: h.escala,
        entregas: h.ids.map((id) => byId.get(id)).filter(Boolean),
      }))
      .filter((h) => h.entregas.length > 0);
    if (!plan.length) {
      setError("Agregá al menos una entrega a una hoja.");
      return;
    }
    setGenerando(true);
    try {
      await generarYDescargar(plan, {
        contacto: true,
        productos: campos.productos,
        pago: campos.pago,
        logistica: campos.logistica,
      });
    } catch (e) {
      setError(e?.message || "No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
    }
  }

  const campoDefs = [
    { key: "productos", label: "Productos" },
    { key: "pago", label: "Monto y pago" },
    { key: "logistica", label: "Fecha / franja / notas" },
  ];

  return (
    <Modal isOpen={open} onClose={cerrar} title="Descargar PDF de etiquetas">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Armá cada hoja A4: elegí qué entregas entran (hasta 4 por hoja) y el tamaño. Menos
          entregas por hoja ⇒ más grandes. Cliente, dirección y teléfono siempre se incluyen.
        </p>

        {/* Campos a incluir */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Datos a incluir</p>
          <div className="flex flex-wrap gap-2">
            {campoDefs.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCampos((s) => ({ ...s, [c.key]: !s[c.key] }))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  campos[c.key]
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/25 dark:text-emerald-400"
                    : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reparto rápido */}
        {disponibles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {disponibles.length} sin asignar. Repartir de a:
            </span>
            {[1, 2, 4].map((n) => (
              <Button key={n} variant="secondary" size="sm" onClick={() => autoRepartir(n)}>
                <Wand2 className="h-4 w-4" />
                {n}/hoja
              </Button>
            ))}
          </div>
        )}

        {/* Hojas */}
        <div className="flex flex-col gap-3">
          {hojas.map((h, i) => {
            const n = h.ids.length;
            const max = ESCALA_MAX[Math.min(4, Math.max(1, n || 1))];
            return (
              <div
                key={h.uid}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Hoja {i + 1}{" "}
                    <span className="font-normal text-slate-400">
                      · {n} {n === 1 ? "entrega" : "entregas"}
                    </span>
                  </p>
                  <button
                    onClick={() => removeHoja(h.uid)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    aria-label="Quitar hoja"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Miniatura + entregas asignadas */}
                <div className="flex gap-3">
                  <MiniA4 n={n} nombres={h.ids.map((id) => byId.get(id)?.cliente || "—")} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      {h.ids.map((id) => {
                        const e = byId.get(id);
                        return (
                          <span
                            key={id}
                            className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <span className="truncate">{e?.cliente || "—"}</span>
                            <button
                              onClick={() => removeEntrega(h.uid, id)}
                              className="shrink-0 text-slate-400 hover:text-red-500"
                              aria-label="Quitar"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                      {n < 4 && (
                        <button
                          onClick={() => setPickerHoja(pickerHoja === h.uid ? null : h.uid)}
                          disabled={!disponibles.length}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-700"
                        >
                          <Plus className="h-3 w-3" />
                          Agregar
                        </button>
                      )}
                    </div>

                    {/* Picker de entregas disponibles */}
                    {pickerHoja === h.uid && disponibles.length > 0 && (
                      <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        {disponibles.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => addEntrega(h.uid, e.id)}
                            className="flex w-full flex-col items-start border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                          >
                            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                              {e.cliente}
                            </span>
                            <span className="truncate text-xs text-slate-500">{e.direccion}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Escala */}
                {n > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>Tamaño del texto</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {escalaLabel(h.escala)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ESCALA_MIN}
                      max={max}
                      step={0.05}
                      value={Math.min(h.escala, max)}
                      onChange={(ev) => setEscala(h.uid, Number(ev.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                )}
              </div>
            );
          })}

          <Button variant="secondary" onClick={addHoja}>
            <Plus className="h-4 w-4" />
            Agregar hoja
          </Button>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={16} /> {error}
          </p>
        )}

        {/* Acción */}
        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t border-slate-100 bg-white/90 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <span className="text-xs text-slate-500">
            {totalEnHojas} de {entregas.length} en el PDF
          </span>
          <Button className="ml-auto" onClick={descargar} disabled={generando}>
            <FileDown className="h-4 w-4" />
            {generando ? "Generando…" : "Descargar PDF"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Miniatura de la hoja A4 mostrando cómo quedan las celdas.
function MiniA4({ n, nombres = [] }) {
  const filas = n === 4 ? 2 : Math.max(1, n);
  const cols = n === 4 ? 2 : 1;
  const celdas = Array.from({ length: Math.max(1, n) });
  return (
    <div
      className="grid h-24 w-[68px] shrink-0 gap-0.5 rounded-md border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
      style={{
        gridTemplateRows: `repeat(${filas}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {n === 0 ? (
        <div className="flex items-center justify-center rounded-sm bg-white text-[9px] text-slate-300 dark:bg-slate-900">
          vacía
        </div>
      ) : (
        celdas.map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-center overflow-hidden rounded-sm bg-white p-0.5 text-center text-[7px] leading-tight text-slate-500 dark:bg-slate-900"
          >
            <span className="line-clamp-2">{nombres[i] || ""}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default PdfEtiquetas;
