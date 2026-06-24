import { ReactNode, useEffect, useRef } from "react";
import { Redirect } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useAuth, HAD_SESSION_KEY, type AuthContextType } from "@/lib/auth";
import { dispatchSessionExpired } from "@/lib/authEvents";
import { FEATURES } from "@/config/features";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Si es "empresas", exige sesión de CODA Empresas y redirige a /empresas/login. Por defecto "personal". */
  context?: AuthContextType;
  /** La propia ruta de onboarding lo pasa para no redirigirse a sí misma. */
  skipOnboardingGate?: boolean;
}

export default function ProtectedRoute({ children, context = "personal", skipOnboardingGate = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth(context);
  const loginPath = context === "empresas" ? "/empresas/login" : ROUTES.iniciarSesion;
  const didFireRef = useRef(false);

  // Gate de onboarding (sólo personal, con el flag encendido). Con el flag
  // apagado useOnboardingStatus no consulta → no-op (no cambia nada).
  const gateActive = FEATURES.onboarding && context === "personal" && !skipOnboardingGate;
  const { status, isLoading: onboardingLoading } = useOnboardingStatus();

  // When the route guard decides to redirect because there is no token,
  // fire the session-expired event so SessionExpiryGuard shows the toast —
  // but only if the user previously had a session (marker set by login/register).
  // First-ever visitors get a silent redirect to /login as before.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !didFireRef.current) {
      const hadSession = sessionStorage.getItem(HAD_SESSION_KEY);
      if (hadSession) {
        didFireRef.current = true;
        dispatchSessionExpired(window.location.pathname);
      }
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to={loginPath} />;
  }

  // Onboarding incompleto → enviar al flujo. Mientras carga el estado, no
  // renderizar la página (evita el flash antes de redirigir).
  if (gateActive) {
    if (onboardingLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      );
    }
    if (status && !status.completed) {
      return <Redirect to={ROUTES.verificacion} />;
    }
  }

  return <>{children}</>;
}
