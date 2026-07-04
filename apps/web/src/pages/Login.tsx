import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { mapLoginAuthError } from "@/lib/userFacingErrors";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  Lock,
  Loader2,
  Shield,
  RefreshCw,
  Eye,
  EyeOff,
  BarChart3,
  Store,
  CheckCircle2,
  ArrowLeft,
  Mail,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { Analytics } from "@/lib/analytics";
import { FEATURES } from "@/config/features";

const brandFeatures = [
  { icon: BarChart3, text: "Score crediticio dual basado en tus datos reales" },
  { icon: Store, text: "Marketplace de productos financieros (créditos, tarjetas, depósitos, fondos)" },
  { icon: Shield, text: "Diseñado bajo la normativa CMF y Ley Fintec" },
];

function BrandPanel({ isEmpresas }: { isEmpresas: boolean }) {
  // "CODA Empresas" branding only when the CODA Empresas flag is on. Without
  // the flag, /empresas/login isn't registered so isEmpresas can't be true,
  // but we gate the literal anyway for grep-clean compliance.
  const brand = FEATURES.codaEmpresas && isEmpresas ? "CODA Empresas" : "CODA";
  return (
    <div className="hidden lg:flex flex-col justify-between bg-[#0c0a09] text-white p-12 w-1/2 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-orange-500/10 blur-[80px] pointer-events-none" />

      {/* Logo — siempre lleva al inicio */}
      <Link href="/" className="relative flex items-center gap-3 w-fit group" aria-label="Ir al inicio">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight group-hover:text-primary transition-colors">{brand}</span>
      </Link>

      {/* Main copy */}
      <div className="relative space-y-8">
        <div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Tu salud financiera,{" "}
            <span className="bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
              en un solo lugar
            </span>
          </h2>
          <p className="text-slate-400 leading-relaxed">
            Diagnóstico financiero automatizado, score crediticio dual y
            recomendaciones personalizadas basadas en tus datos reales.
          </p>
        </div>

        <ul className="space-y-4">
          {brandFeatures.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-slate-300 leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer note */}
      <div className="relative flex items-center gap-2 text-xs text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
        Chile Open-Data Analytics SpA · RUT 78.389.632-K · Inscripción CMF en trámite
      </div>
    </div>
  );
}

export default function Login() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const isEmpresas = location === "/empresas/login";
  const defaultRedirect = isEmpresas ? "/empresas/dashboard" : ROUTES.panel;
  const authContext = isEmpresas ? "empresas" : "personal";
  const { login: doLogin, isAuthenticated: isAuth } = useAuth(authContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [requires2FA, setRequires2FA] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  // Forgot password flow
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
    } catch {
      // Intentionally ignore errors — always show success to avoid email enumeration
    } finally {
      setForgotLoading(false);
      setForgotSent(true);
    }
  };

  if (isAuth) {
    setLocation(defaultRedirect);
    return null;
  }

  const handleSubmit = async (e: React.FormEvent, retryCount = 0) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Show "waking up" hint after 3s of waiting
    if (retryCount === 0) setShowSlowHint(false);
    const slowTimer = setTimeout(() => setShowSlowHint(true), retryCount > 0 ? 0 : 3000);

    try {
      const result = await doLogin(authContext, email, password);
      clearTimeout(slowTimer);
      setShowSlowHint(false);
      setIsLoading(false);

      if (result?.requires2FA) {
        setRequires2FA(true);
        toast({ title: "Verificación requerida", description: "Se ha enviado un código a tu correo." });
        return;
      }
      toast({ title: "Sesión iniciada", description: "¡Bienvenido de nuevo!" });
      Analytics.loginSuccess(isEmpresas ? "empresa" : "persona");
      const ssReturnTo = sessionStorage.getItem("coda:post_login_return_to");
      if (ssReturnTo) {
        sessionStorage.removeItem("coda:post_login_return_to");
        setLocation(ssReturnTo);
      } else {
        const redirectUrl = localStorage.getItem("redirectAfterLogin");
        if (redirectUrl) {
          localStorage.removeItem("redirectAfterLogin");
          setLocation(redirectUrl);
        } else {
          setLocation(defaultRedirect);
        }
      }
    } catch (err) {
      clearTimeout(slowTimer);

      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : "";
      const isColdStart =
        (status === 0 && msg.includes("tardó demasiado")) ||
        (typeof status === "number" && status >= 500);

      // Auto-retry up to 2 times on cold start (server waking up)
      if (isColdStart && retryCount < 2) {
        setShowSlowHint(true);
        setError("");
        // Keep isLoading true — don't reset it
        setTimeout(() => {
          handleSubmit(e, retryCount + 1);
        }, 3000);
        return; // Don't fall through to setIsLoading(false)
      }

      // Real error — show it
      setShowSlowHint(false);
      setIsLoading(false);
      setError(mapLoginAuthError(err));
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode }),
      });
      if (data.token && data.user) {
        // Empresas sigue token-based (sin cambios). Personal cookie-first (C2): no
        // guardamos jwt_token/user_data nuevos — la cookie httpOnly ya quedó seteada
        // por 2fa/verify y la sesión se rehidrata desde /api/auth/me tras el reload.
        if (isEmpresas) {
          localStorage.setItem("jwt_token_empresas", data.token);
          localStorage.setItem("user_data_empresas", JSON.stringify(data.user));
        }
        toast({ title: "Sesión iniciada", description: "¡Bienvenido de nuevo!" });
        Analytics.loginSuccess(isEmpresas ? "empresa" : "persona");
        window.location.href = defaultRedirect;
      }
    } catch (err) {
      setError(mapLoginAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError("");
    try {
      await apiFetch("/api/auth/2fa/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      toast({ title: "Código enviado", description: "Revisa tu correo." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reenviar el código");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <BrandPanel isEmpresas={isEmpresas} />

      {/* Right: Form */}
      <div className="flex-1 lg:w-1/2 flex flex-col justify-center bg-background px-6 py-12 sm:px-12 lg:px-16">
        {/* Mobile logo — siempre lleva al inicio */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-10 w-fit" aria-label="Ir al inicio">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">
            {FEATURES.codaEmpresas && isEmpresas ? "CODA Empresas" : "CODA"}
          </span>
        </Link>

        <div className="w-full max-w-md mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {requires2FA ? "Verifica tu identidad" : "Iniciar sesión"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {requires2FA
                ? `Ingresa el código enviado a ${email}`
                : isEmpresas
                  ? "Accede a tu panel de empresas"
                  : "¿No tienes cuenta? " }
              {!requires2FA && !isEmpresas && (
                <Link href={ROUTES.registro} className="text-primary hover:underline font-medium">
                  Crear cuenta gratis
                </Link>
              )}
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {showSlowHint && !error && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2.5">
              <RefreshCw className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Despertando el servidor...</p>
                <p className="text-amber-600 dark:text-amber-400/80 text-xs mt-0.5">
                  Primera conexión del día. Reintentando automáticamente.
                </p>
              </div>
            </div>
          )}

          {showForgot ? (
            /* ── Forgot password panel ── */
            forgotSent ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10 px-4 py-4 text-sm text-green-700 dark:text-green-400 space-y-1">
                  <p className="font-medium">Revisa tu correo</p>
                  <p className="text-green-600 dark:text-green-400">Si el correo <strong>{forgotEmail}</strong> está registrado, recibirás las instrucciones para restablecer tu contraseña.</p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); setError(""); }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio de sesión
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                  </p>
                  <div className="space-y-1.5">
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-foreground">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder="tu@correo.cl"
                        disabled={forgotLoading}
                        className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-sm"
                  disabled={forgotLoading}
                >
                  {forgotLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : "Enviar enlace"}
                </Button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowForgot(false); setForgotEmail(""); setError(""); }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Volver
                </button>
              </form>
            )
          ) : requires2FA ? (
            <form onSubmit={handleVerify2FA} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="otp" className="block text-sm font-medium text-foreground">
                  Código de verificación
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    disabled={isLoading}
                    className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 tracking-widest text-center font-mono text-lg"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold" disabled={isLoading || otpCode.length !== 6}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando...</> : "Verificar código"}
              </Button>

              <div className="flex items-center justify-between">
                <button type="button" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => { setRequires2FA(false); setOtpCode(""); setError(""); }}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Volver
                </button>
                <button type="button" className="text-sm text-primary hover:underline flex items-center gap-1" onClick={handleResendCode} disabled={isLoading}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reenviar código
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.cl"
                    disabled={isLoading}
                    className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-11 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setShowForgot(true); setForgotEmail(email); setError(""); }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-sm"
                disabled={isLoading}
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Iniciando sesión...</>
                ) : (
                  "Iniciar sesión"
                )}
              </Button>
            </form>
          )}

          {/* Footer links */}
          <div className="space-y-3 pt-2">
            <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-600">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio
            </Link>
            {FEATURES.codaEmpresas && isEmpresas && (
              <p className="text-sm text-muted-foreground">
                <Link href={ROUTES.iniciarSesion} className="text-primary hover:underline">
                  Iniciar sesión en CODA Personal
                </Link>
              </p>
            )}
            {FEATURES.codaEmpresas && !isEmpresas && (
              <p className="text-sm text-muted-foreground">
                <Link href="/empresas/login" className="text-primary hover:underline">
                  ¿Eres empresa? CODA Empresas →
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
