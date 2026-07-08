import { useCallback, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/**
 * useConfirm — confirmación in-app (reemplaza window.confirm).
 * Uso:
 *   const [confirm, confirmUI] = useConfirm();
 *   if (!(await confirm("¿Borrar?", { danger: true }))) return;
 *   ...   // y en el render: {confirmUI}
 */
export function useConfirm() {
  const [state, setState] = useState(null); // { message, title, confirmText, danger, resolve }

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({
        message,
        title: opts.title || "Confirmar",
        confirmText: opts.confirmText || "Sí, continuar",
        danger: opts.danger !== false, // por defecto rojo (suelen ser borrados)
        resolve,
      });
    });
  }, []);

  const cerrar = (val) => {
    state?.resolve(val);
    setState(null);
  };

  const confirmUI = (
    <Modal isOpen={state != null} onClose={() => cerrar(false)} title={state?.title || ""}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{state?.message}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button
            variant={state?.danger ? "danger" : "primary"}
            className="flex-1"
            onClick={() => cerrar(true)}
          >
            {state?.confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return [confirm, confirmUI];
}

export default useConfirm;
