/** Spinner de pantalla completa (paleta slate + emerald). */
export function Loader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600 dark:border-slate-700 dark:border-t-emerald-500" />
    </div>
  );
}

export default Loader;
