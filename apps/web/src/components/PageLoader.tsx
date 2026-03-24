/**
 * Fallback de Suspense para rutas lazy — estilo alineado al splash PWA (bg slate-950, acento azul).
 */
export default function PageLoader() {
  return (
    <div
      className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 bg-slate-950 px-4 py-16"
      role="status"
      aria-busy="true"
      aria-label="Cargando"
    >
      <img
        src="/favicon.svg"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 opacity-95"
        decoding="async"
      />
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500 motion-reduce:animate-none" />
    </div>
  );
}
