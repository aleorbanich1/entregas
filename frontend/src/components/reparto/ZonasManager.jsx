import { useEffect, useState } from "react";
import { MapPin, Plus, Check, X, ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { api } from "../../utils/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { cn } from "../../utils/cn";

const isReal = (id) => /^\d+$/.test(String(id));
const sortByOrden = (arr) =>
  [...arr].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.id) - Number(b.id));

/**
 * Zonas — lista editable, sin límite de cantidad, ordenable. Todo por api()/transport
 * (/zonas). Actualización optimista: la UI responde ya y la mutación viaja por la cola.
 */
export function ZonasManager() {
  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");

  useEffect(() => {
    let alive = true;
    api("/zonas")
      .then((data) => alive && setZonas(sortByOrden(data || [])))
      .catch(() => alive && setError("No se pudieron cargar las zonas"))
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
    const orden = zonas.length ? Math.max(...zonas.map((z) => z.orden ?? 0)) + 1 : 0;
    try {
      const res = await api("/zonas", { method: "POST", body: { nombre, orden } });
      const row = res?.id ? res : { id: `tmp-${Date.now()}`, nombre, orden, activa: true };
      setZonas((prev) => sortByOrden([...prev, row]));
      setNuevo("");
    } catch (e) {
      setError(e?.message || "No se pudo agregar la zona");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(z) {
    const activa = !z.activa;
    setZonas((prev) => prev.map((x) => (x.id === z.id ? { ...x, activa } : x)));
    try {
      await api(`/zonas/${z.id}`, { method: "PATCH", body: { activa } });
    } catch {
      setZonas((prev) => prev.map((x) => (x.id === z.id ? { ...x, activa: z.activa } : x)));
      setError("No se pudo actualizar la zona");
    }
  }

  function startEdit(z) {
    setEditId(z.id);
    setEditVal(z.nombre);
  }

  async function saveEdit(z) {
    const nombre = editVal.trim();
    setEditId(null);
    if (!nombre || nombre === z.nombre) return;
    const prevNombre = z.nombre;
    setZonas((prev) => prev.map((x) => (x.id === z.id ? { ...x, nombre } : x)));
    try {
      await api(`/zonas/${z.id}`, { method: "PATCH", body: { nombre } });
    } catch {
      setZonas((prev) => prev.map((x) => (x.id === z.id ? { ...x, nombre: prevNombre } : x)));
      setError("No se pudo renombrar la zona");
    }
  }

  async function move(z, dir) {
    const list = sortByOrden(zonas);
    const idx = list.findIndex((x) => x.id === z.id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;

    const reordered = [...list];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    const withOrden = reordered.map((x, i) => ({ ...x, orden: i }));
    setZonas(withOrden);

    // Persistimos sólo las filas reales cuyo orden cambió.
    const changed = withOrden.filter(
      (x) => isReal(x.id) && (list.find((l) => l.id === x.id)?.orden ?? -1) !== x.orden
    );
    try {
      await Promise.all(
        changed.map((x) => api(`/zonas/${x.id}`, { method: "PATCH", body: { orden: x.orden } }))
      );
    } catch {
      setError("No se pudo reordenar");
    }
  }

  async function borrar(z) {
    if (!confirm(`¿Borrar la zona "${z.nombre}"?`)) return;
    setError("");
    const prev = zonas;
    setZonas((cur) => cur.filter((x) => x.id !== z.id));
    if (!isReal(z.id)) return;
    try {
      await api(`/zonas/${z.id}`, { method: "DELETE" });
    } catch (e) {
      setZonas(prev);
      const msg = String(e?.message || "");
      setError(
        /foreign key|violates|constraint/i.test(msg)
          ? "No se puede borrar: hay entregas en esta zona. Desactivala en su lugar."
          : "No se pudo borrar la zona."
      );
    }
  }

  if (loading) {
    return <p className="px-1 py-6 text-center text-sm text-slate-500">Cargando zonas…</p>;
  }

  const list = sortByOrden(zonas);

  return (
    <div className="flex flex-col gap-4">
      {/* Alta */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            placeholder="Nueva zona (ej: Centro)"
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
        <p className="py-6 text-center text-sm text-slate-500">Todavía no hay zonas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((z, i) => (
            <li
              key={z.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:bg-slate-900",
                z.activa
                  ? "border-slate-200 dark:border-slate-800"
                  : "border-slate-200 opacity-60 dark:border-slate-800"
              )}
            >
              {/* Reordenar */}
              <div className="flex flex-col">
                <button
                  onClick={() => move(z, "up")}
                  disabled={i === 0}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  aria-label="Subir"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(z, "down")}
                  disabled={i === list.length - 1}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  aria-label="Bajar"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />

              {/* Nombre / edición */}
              {editId === z.id ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => saveEdit(z)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(z);
                    if (e.key === "Escape") setEditId(null);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-emerald-500 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-slate-50"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-50">
                  {z.nombre}
                </span>
              )}

              {/* Activar / desactivar */}
              <button
                onClick={() => toggle(z)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  z.activa
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {z.activa ? "Activa" : "Inactiva"}
              </button>

              {/* Editar */}
              {editId === z.id ? (
                <button
                  onClick={() => saveEdit(z)}
                  className="rounded-full p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/25"
                  aria-label="Guardar"
                >
                  <Check className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => startEdit(z)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Renombrar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => borrar(z)}
                className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Borrar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ZonasManager;
