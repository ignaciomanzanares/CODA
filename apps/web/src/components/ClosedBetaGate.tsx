/**
 * Gate de beta cerrada para el registro. Consulta /api/beta/status en runtime
 * (encender/apagar = solo CLOSED_BETA en Render, sin rebuild del frontend):
 *  - flag apagado → renderiza el flujo de registro normal (children);
 *  - flag encendido → pide código de invitación (validado contra el backend)
 *    o captura el correo en la lista de espera.
 * El backend igualmente rechaza el registro sin código válido (403): esto es
 * UX, no la barrera de seguridad.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { API_URL } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Lock, KeyRound, Mail, Loader2, CheckCircle2 } from "lucide-react";

export const BETA_INVITE_STORAGE_KEY = "coda:beta_invite";

const apiBase = (API_URL || "").replace(/\/$/, "");

export default function ClosedBetaGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(BETA_INVITE_STORAGE_KEY) !== null,
  );
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [waitEmail, setWaitEmail] = useState("");
  const [waitState, setWaitState] = useState<"idle" | "sending" | "done">("idle");

  const status = useQuery<{ closedBeta: boolean }>({
    queryKey: ["/api/beta/status"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/beta/status`);
      if (!r.ok) throw new Error("status failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
    // Si el endpoint falla, no dejamos a nadie afuera: gate abierto.
    retry: 1,
  });

  if (status.isLoading) return null;
  // Flag apagado, código ya validado en esta sesión, o estado no disponible
  // (fallo del endpoint → abierto, no dejamos a nadie afuera) → flujo normal.
  const closed = status.data?.closedBeta ?? false;
  if (!closed || unlocked) return <>{children}</>;

  const submitCode = async () => {
    setCheckingCode(true);
    setCodeError(null);
    try {
      const r = await fetch(`${apiBase}/api/beta/validate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = (await r.json().catch(() => ({}))) as { valid?: boolean };
      if (data.valid) {
        sessionStorage.setItem(BETA_INVITE_STORAGE_KEY, code.trim());
        setUnlocked(true);
      } else {
        setCodeError("Código no válido. Revisa que esté bien escrito.");
      }
    } catch {
      setCodeError("No pudimos validar el código. Intenta de nuevo.");
    } finally {
      setCheckingCode(false);
    }
  };

  const submitWaitlist = async () => {
    setWaitState("sending");
    try {
      const r = await fetch(`${apiBase}/api/beta/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitEmail.trim() }),
      });
      if (!r.ok) throw new Error("waitlist failed");
      setWaitState("done");
    } catch {
      setWaitState("idle");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-3">
          <PastelIcon icon={Lock} color="orange" size="lg" className="mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">Estamos en beta cerrada</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Mientras completamos nuestra inscripción como prestador ante la CMF, el acceso a CODA es
            por invitación.
          </p>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Tengo un código de invitación</p>
            </div>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código"
                onKeyDown={(e) => e.key === "Enter" && code.trim() && submitCode()}
              />
              <Button onClick={submitCode} disabled={!code.trim() || checkingCode}>
                {checkingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </div>
            {codeError && <p className="text-xs text-red-500">{codeError}</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Avísame cuando abran el acceso</p>
            </div>
            {waitState === "done" ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> ¡Listo! Te avisaremos por correo.
              </p>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={waitEmail}
                  onChange={(e) => setWaitEmail(e.target.value)}
                  placeholder="tu@correo.cl"
                  onKeyDown={(e) => e.key === "Enter" && waitEmail.trim() && submitWaitlist()}
                />
                <Button
                  variant="outline"
                  onClick={submitWaitlist}
                  disabled={
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitEmail.trim()) || waitState === "sending"
                  }
                >
                  {waitState === "sending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Anotarme"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href={ROUTES.iniciarSesion} className="text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
