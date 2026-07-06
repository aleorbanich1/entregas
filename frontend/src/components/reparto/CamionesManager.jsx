import { useEffect, useState } from "react";
import { Truck, Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../../utils/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { cn } from "../../utils/cn";

const isReal = (id) => /^\d+$/.test(String(id));

/**
 * Camiones — crear (nombre + patente opcional), listar, activar/desactivar,
 * editar y borrar. Los camiones son OPCIONALES (camion_id es nullable).
 */
export function CamionesManager() {
  const [camiones, setCamiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");
  const [patente, setPatente] = useState("");
  const [busy, setBusy] = useState(false);

  // Edición
  const [editando, setEditando] = useState(null); // camión o null
  const [edNombre, setEdNombre] = useState("");
  const [edPatente, setEdPatente] = useState("");

  useEffect(() => {
    let alive = true;
    api("/camiones")
      .then((data) => alive && setCamiones(data || []))
      .catch(() => alive && setError("No se pudieron cargar los camiones"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function crear() {
    const n = nombre.trim();
    if (!n) return;
    setBusy(true);
    setError("");
    try {
      const res = await api("/camiones", {
        method: "POST",
        body: { nombre: n, patente: patente.trim() || null },
      });
      const row = res?.id
        ? res
        : { id: `tmp-${Date.now()}`, nombre: n, patente: patente.trim() || null, activo: true };
      setCamiones((prev) => [...prev, row]);
      setNombre("");
      setPatente("");
    } catch (e) {
      setError(e?.message || "No se pudo crear el camión");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c) {
    const activo = !c.activo;
    setCamiones((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo } : x)));
    try {
      await api(`/camiones/${c.id}`, { method: "PATCH", body: { activo } });
    } catch {
      setCamiones((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: c.activo } : x)));
      setError("No se pudo actualizar el camión");
    }
  }

  function abrirEdicion(c) {
    setEditando(c);
    setEdNombre(c.nombre || "");
    setEdPatente(c.patente || "");
    setError("");
  }

  async function guardarEdicion() {
    const n = edNombre.trim();
    if (!n) return;
    const patch = { nombre: n, patente: edPatente.trim() || null };
    setCamiones((prev) => prev.map((x) => (x.id === editando.id ? { ...x, ...patch } : x)));
    const c = editando;
    setEditando(null);
    try {
      await api(`/camiones/${c.id}`, { method: "PATCH", body: patch });
    } catch {
      setError("No se pudo guardar el camión");
    }
  }

  async function borrar(c) {
    if (!confirm(`¿Borrar el camión "${c.nombre}"?`)) return;
    setError("");
    const prev = camiones;
    setCamiones((cur) => cur.filter((x) => x.id !== c.id));
    if (!isReal(c.id)) return; // era temporal (offline), no hay nada que borrar en el server
    try {
      await api(`/camiones/${c.id}`, { method: "DELETE" });
    } catch (e) {
      // Suele fallar si el camión tiene entregas asociadas (clave foránea).
      setCamiones(prev);
      const msg = String(e?.message || "");
      setError(
        /foreign key|violates|constraint/i.test(msg)
          ? "No se puede borrar: hay entregas con este camión. Desactivalo en su lugar."
          : "No se pudo borrar el camión."
      );
    }
  }

  if (loading) {
    return <p className="px-1 py-6 text-center text-sm text-slate-500">Cargando camiones…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Alta */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Crear camión</p>
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Nombre (ej: Camión 1)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Input
            placeholder="Patente (opcional)"
            value={patente}
            onChange={(e) => setPatente(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
          />
          <Button onClick={crear} disabled={busy || !nombre.trim()}>
            <Plus className="h-4 w-4" />
            Crear camión
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {camiones.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Todavía no hay camiones. Podés usar la app sin ellos.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {camiones.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-white px-3 py-3 dark:bg-slate-900",
                c.activo
                  ? "border-slate-200 dark:border-slate-800"
                  : "border-slate-200 opacity-60 dark:border-slate-800"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
                <Truck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                  {c.nombre}
                </p>
                {c.patente && (
                  <p className="truncate text-xs uppercase tracking-wide text-slate-500">
                    {c.patente}
                  </p>
                )}
              </div>
              <button
                onClick={() => toggle(c)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  c.activo
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                )}
              >
                {c.activo ? "Activo" : "Inactivo"}
              </button>
              <button
                onClick={() => abrirEdicion(c)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => borrar(c)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Borrar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Editar camión */}
      <Modal isOpen={editando != null} onClose={() => setEditando(null)} title="Editar camión">
        <div className="flex flex-col gap-3">
          <Input placeholder="Nombre" value={edNombre} onChange={(e) => setEdNombre(e.target.value)} />
          <Input
            placeholder="Patente (opcional)"
            value={edPatente}
            onChange={(e) => setEdPatente(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardarEdicion()}
          />
          <Button onClick={guardarEdicion} disabled={!edNombre.trim()}>
            Guardar cambios
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default CamionesManager;
