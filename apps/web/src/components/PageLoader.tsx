import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Fallback de Suspense para rutas lazy — estilo alineado al splash PWA.
 */
export default function PageLoader() {
  const online = useOnlineStatus();

  if (!online) {
    return (
      <div
        className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4 bg-slate-950 px-4 py-16 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <WifiOff className="h-6 w-6" />
        </div>
        <div className="max-w-xs space-y-1.5">
          <p className="text-sm font-semibold text-white">Sin conexión</p>
          <p className="text-xs leading-relaxed text-slate-400">
            Esta vista necesita descargarse antes de poder abrirse offline.
          </p>
        </div>
      </div>
    );
  }

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
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-primary motion-reduce:animate-none" />
    </div>
  );
}
