import { ReactNode } from "react";
import { Redirect } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/lib/auth";
import ProtectedRoute from "./ProtectedRoute";

/**
 * Ruta solo-admin. Reusa ProtectedRoute (sesión personal + gate de onboarding) y encima
 * exige `role === 'admin'`. El rol viene del JWT vía /api/auth/me; el backend lo re-valida
 * con el middleware requireAdmin, así que esto es solo UX (no un control de seguridad).
 * Un usuario autenticado no-admin se redirige al panel.
 */
export default function AdminRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute context="personal">
      <AdminGate>{children}</AdminGate>
    </ProtectedRoute>
  );
}

function AdminGate({ children }: { children: ReactNode }) {
  const { user } = useAuth("personal");
  if (user?.role !== "admin") {
    return <Redirect to={ROUTES.panel} />;
  }
  return <>{children}</>;
}
