import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ROUTES } from "@/lib/routes";

/**
 * Listens for the global 'coda:session:expired' event (dispatched by the
 * fetch layer when any authenticated API call returns 401, and by
 * ProtectedRoute when it detects a missing token on hard reload).
 *
 * On expiry:
 *  1. Shows a Spanish toast (debounced — max once per 2 s to prevent
 *     duplicate toasts when both the route guard and an XHR fire at the
 *     same time).
 *  2. Saves the current pathname+search to sessionStorage so Login can
 *     redirect back after successful re-authentication.
 *  3. Navigates to /iniciar-sesion.
 */
export default function SessionExpiryGuard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const lastFiredRef = useRef<number>(0);

  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      // Suppress duplicate events fired within 2 seconds (e.g. route guard +
      // XHR interceptor both firing on a hard reload with cleared token).
      if (now - lastFiredRef.current < 2000) return;
      lastFiredRef.current = now;

      toast({
        title: "Sesión expirada",
        description:
          "Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.",
        variant: "destructive",
      });
      sessionStorage.setItem(
        "coda:post_login_return_to",
        window.location.pathname + window.location.search
      );
      setLocation(ROUTES.iniciarSesion);
    };

    window.addEventListener("coda:session:expired", handler);
    return () => window.removeEventListener("coda:session:expired", handler);
  }, [setLocation, toast]);

  return null;
}
