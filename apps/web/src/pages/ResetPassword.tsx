import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Lock, Wallet } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") ?? "";
    if (!t) setError("El enlace no es válido. Solicita uno nuevo desde la página de inicio de sesión.");
    setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña. El enlace puede haber expirado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">CODA</span>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm p-8 space-y-6">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <div>
                <h2 className="text-lg font-semibold">Contraseña actualizada</h2>
                <p className="text-sm text-muted-foreground mt-1">Ya puedes iniciar sesión con tu nueva contraseña.</p>
              </div>
              <Button className="w-full" onClick={() => navigate(ROUTES.iniciarSesion)}>
                Iniciar sesión
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Nueva contraseña</h2>
                </div>
                <p className="text-sm text-muted-foreground">Ingresa y confirma tu nueva contraseña.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="new-password" className="block text-sm font-medium">
                    Nueva contraseña
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading || !token}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="block text-sm font-medium">
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Repite tu contraseña"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={loading || !token}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !token}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : "Guardar contraseña"}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => navigate(ROUTES.iniciarSesion)}
                >
                  Volver al inicio de sesión
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
