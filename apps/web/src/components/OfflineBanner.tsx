import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[110] border-b border-amber-300/50 bg-amber-50 px-4 py-2 text-amber-900 shadow-sm dark:border-amber-800/60 dark:bg-amber-950 dark:text-amber-100"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 text-center text-xs font-medium sm:text-sm">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Sin conexión. Puedes seguir viendo lo que ya esté cargado.</span>
      </div>
    </div>
  );
}
