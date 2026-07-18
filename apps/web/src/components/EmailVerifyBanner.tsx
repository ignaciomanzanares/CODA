/**
 * Banner fino bajo el header cuando la sesión personal tiene el correo sin
 * verificar (/me → emailVerified false). No bloquea el uso; permite reenviar.
 */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";
import { MailWarning, Loader2 } from "lucide-react";

export default function EmailVerifyBanner() {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const emailVerified = (user as { emailVerified?: boolean } | null)?.emailVerified;
  if (!isAuthenticated || emailVerified !== false) return null;

  const resend = async () => {
    setState("sending");
    try {
      await apiFetch("/api/auth/resend-verification", { method: "POST" });
      setState("sent");
    } catch {
      setState("idle");
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 px-4 py-2">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-center gap-2 text-xs text-amber-800 dark:text-amber-300">
        <MailWarning className="h-3.5 w-3.5 shrink-0" />
        <span>
          Verifica tu correo para asegurar tu cuenta — te enviamos un enlace al registrarte.
        </span>
        {state === "sent" ? (
          <span className="font-medium">Enlace reenviado ✓</span>
        ) : (
          <button
            onClick={resend}
            disabled={state === "sending"}
            className="font-medium underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-1"
          >
            {state === "sending" && <Loader2 className="h-3 w-3 animate-spin" />}
            Reenviar
          </button>
        )}
      </div>
    </div>
  );
}
