import { useEffect, useState } from "react";
import { CreditCard, Plus, Check, ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { api } from "../../utils/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useConfirm } from "../ui/Confirm";
import { cn } from "../../utils/cn";

const isReal = (id) => /^\d+$/.test(String(id));
const sortByOrden = (arr) =>
  [...arr].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id));

/**
 * MediosPagoManager — lista editable de medios de pago (Efectivo, Transferencia…).
 * Mismo patrón que Zonas: alta, renombrar, activar/desactivar, reordenar y borrar.
 * Los medios activos son los que aparecen al cargar una entrega.
 */
export function MediosPagoManager() {
  const [medios, setMedios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [confirm, confirmUI] = useConfirm();

  useEffect(() => {
    let alive = true;
    api("/medios-pago")
      .then((data) => alive && setMedios(sortByOrden(data || [])))
      .catch(() =>
        alive &&
        setError(
          "No se pudieron cargar los medios de pago. Puede que falte crear la tabla en la base de datos."
        )
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setBusy(true);
    setError("");
    const orden = medios.length ? Math.max(...medios.map((m) => m.orden ?? 0)) + 1 : 0;
    try {
      const res = await api("/medios-pago", { method: "POST", body: { nombre, orden } });
      const row = res?.id ? res : { id: `tmp-${Date.now()}`, nombre, orden, activo: true };
      setMedios((prev) => sortByOrden([...prev, row]));
      setNuevo("");
    } catch (e) {
      setError(e?.message || "No se pudo agregar el medio de pago");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(m) {
    const activo = !m.activo;
    setMedios((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo } : x)));
    try {
      await api(`/medios-pago/${m.id}`, { method: "PATCH", body: { activo } });
    } catch {
      setMedios((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo: m.activo } : x)));
      setError("No se pudo actualizar el medio de pago");
    }
  }

  function startEdit(m) {
    setEditId(m.id);
    setEditVal(m.nombre);
  }

  async function saveEdit(m) {
    const nombre = editVal.trim();
    setEditId(null);
    if (!nombre || nombre === m.nombre) return;
    const prevNombre = m.nombre;
    setMedios((prev) => prev.map((x) => (x.id === m.id ? { ...x, nombre } : x)));
    try {
      await api(`/medios-pago/${m.id}`, { method: "PATCH", body: { nombre } });
    } catch {
      setMedios((prev) => prev.map((x) => (x.id === m.id ? { ...x, nombre: prevNombre } : x)));
      setError("No se pudo renombrar el medio de pago");
    }
  }

  async function move(m, dir) {
    const list = sortByOrden(medios);
    const idx = list.findIndex((x) => x.id === m.id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;

    const reordered = [...list];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    const withOrden = reordered.map((x, i) => ({ ...x, orden: i }));
    setMedios(withOrden);

    const changed = withOrden.filter(
      (x) => isReal(x.id) && (list.find((l) => l.id === x.id)?.orden ?? -1) !== x.orden
    );
    try {
      await Promise.all(
        changed.map((x) => api(`/medios-pago/${x.id}`, { method: "PATCH", body: { orden: x.orden } }))
      );
    } catch {
      setError("No se pudo reordenar");
    }
  }

  async function borrar(m) {
    if (
      !(await confirm(`¿Borrar el medio de pago "${m.nombre}"?`, {
        title: "Borrar medio de pago",
        confirmText: "Borrar",
      }))
    )
      return;
    setError("");
    const prev = medios;
    setMedios((cur) => cur.filter((x) => x.id !== m.id));
    if (!isReal(m.id)) return;
    try {
      await api(`/medios-pago/${m.id}`, { method: "DELETE" });
    } catch (e) {
      setMedios(prev);
      const msg = String(e?.message || "");
      setError(
        /foreign key|violates|constraint/i.test(msg)
          ? "No se puede borrar: hay entregas con este medio de pago. Desactivalo en su lugar."
          : "No se pudo borrar el medio de pago."
      );
    }
  }

  if (loading) {
    return <p className="px-1 py-6 text-center text-sm text-slate-500">Cargando medios de pago…</p>;
  }

  const list = sortByOrden(medios);

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Estos son los medios de pago que aparecen al cargar una entrega. Podés agregar los tuyos
        (ej: “Naranja X”, “Cuenta DNI”) y desactivar los que no uses.
      </p>

      {/* Alta */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            placeholder="Nuevo medio de pago (ej: Cuenta DNI)"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
          />
        </div>
        <Button size="sm" onClick={agregar} disabled={busy || !nuevo.trim()} className="min-h-[52px] px-4">
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Todavía no hay medios de pago.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((m, i) => (
            <li
              key={m.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:bg-slate-900",
                m.activo
                  ? "border-slate-200 dark:border-slate-800"
                  : "border-slate-200 opacity-60 dark:border-slate-800"
              )}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(m, "up")}
                  disabled={i === 0}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  aria-label="Subir"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(m, "down")}
                  disabled={i === list.length - 1}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  aria-label="Bajar"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <CreditCard className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />

              {editId === m.id ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => saveEdit(m)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(m);
                    if (e.key === "Escape") setEditId(null);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-emerald-500 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-slate-50"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-50">
                  {m.nombre}
                </span>
              )}

              <button
                onClick={() => toggle(m)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  m.activo
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {m.activo ? "Activo" : "Inactivo"}
              </button>

              {editId === m.id ? (
                <button
                  onClick={() => saveEdit(m)}
                  className="rounded-full p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/25"
                  aria-label="Guardar"
                >
                  <Check className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => startEdit(m)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Renombrar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => borrar(m)}
                className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Borrar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmUI}
    </div>
  );
}

export default MediosPagoManager;
