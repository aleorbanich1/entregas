import { Component } from "react";

/**
 * ErrorBoundary global. Los componentes no deberían romperse por datos
 * incompletos de realtime, pero si algo explota, mostramos un fallback y no
 * una pantalla en blanco.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center dark:bg-slate-950">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Algo salió mal
          </h1>
          <p className="text-sm text-slate-500">
            Reintentá o recargá la app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white active:scale-[0.98] dark:bg-emerald-500"
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
