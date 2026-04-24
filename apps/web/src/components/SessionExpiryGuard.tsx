import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ROUTES } from "@/lib/routes";

/**
 * Listens for the global 'coda:session:expired' event (dispatched by the
 * fetch layer when any authenticated API call returns 401).
 *
 * On expiry:
 *  1. Shows a Spanish toast.
 *  2. Saves the current pathname+search to sessionStorage so Login can
 *     redirect back after successful re-authentication.
 *  3. Navigates to /iniciar-sesion.
 */
export default function SessionExpiryGuard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const handler = () => {
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
