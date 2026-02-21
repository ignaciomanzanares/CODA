import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth, type AuthContextType } from "@/lib/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Si es "empresas", exige sesión de CODA Empresas y redirige a /empresas/login. Por defecto "personal". */
  context?: AuthContextType;
}

export default function ProtectedRoute({ children, context = "personal" }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth(context);
  const loginPath = context === "empresas" ? "/empresas/login" : "/login";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to={loginPath} />;
  }

  return <>{children}</>;
}
