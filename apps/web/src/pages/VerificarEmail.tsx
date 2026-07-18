/**
 * Destino del link de verificación de correo (?token=...). Página pública:
 * el usuario puede llegar sin sesión desde su cliente de correo.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { API_URL } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { MailCheck, MailX, Loader2 } from "lucide-react";

const apiBase = (API_URL || "").replace(/\/$/, "");

export default function VerificarEmail() {
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setState("error");
      setMessage("Falta el token de verificación en el enlace.");
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await r.json().catch(() => ({}))) as { message?: string };
        if (r.ok) {
          setState("ok");
          setMessage(data.message ?? "¡Correo verificado!");
        } else {
          setState("error");
          setMessage(data.message ?? "El enlace no es válido o expiró.");
        }
      } catch {
        setState("error");
        setMessage("No pudimos verificar tu correo. Revisa tu conexión e intenta de nuevo.");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        {state === "working" ? (
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <PastelIcon
            icon={state === "ok" ? MailCheck : MailX}
            color={state === "ok" ? "green" : "red"}
            size="lg"
            className="mx-auto"
          />
        )}
        <h1 className="text-xl font-bold tracking-tight">
          {state === "working"
            ? "Verificando tu correo…"
            : state === "ok"
              ? "¡Correo verificado!"
              : "No pudimos verificar"}
        </h1>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {state !== "working" && (
          <Link href={state === "ok" ? ROUTES.panel : ROUTES.iniciarSesion}>
            <Button className="mt-2">{state === "ok" ? "Ir a mi panel" : "Iniciar sesión"}</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
