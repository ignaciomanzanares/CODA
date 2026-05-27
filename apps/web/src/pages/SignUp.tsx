import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  User,
  Lock,
  Mail,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Eye,
  EyeOff,
  BarChart3,
  Store,
  Shield,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { mapUserFacingApiError } from "@/lib/userFacingErrors";
import { Analytics } from "@/lib/analytics";
import { getRefFromUrl, storeReferralCode, getStoredReferralCode, clearStoredReferralCode } from "@/lib/referral";

const brandFeatures = [
  { icon: BarChart3, text: "Score crediticio dual basado en tus datos reales" },
  { icon: Store, text: "Marketplace de productos financieros (créditos, tarjetas, depósitos, fondos)" },
  { icon: Shield, text: "Diseñado bajo la normativa CMF y Ley Fintec" },
];

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${met ? "text-green-600" : "text-muted-foreground"}`}>
      <CheckCircle2 className={`h-3 w-3 shrink-0 ${met ? "text-green-500" : "text-muted-foreground/60"}`} />
      {text}
    </div>
  );
}

export default function SignUp() {
  const [, setLocation] = useLocation();
  const { register, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Capture referral code from URL on mount, persist in sessionStorage
  useEffect(() => {
    const refFromUrl = getRefFromUrl();
    if (refFromUrl) {
      storeReferralCode(refFromUrl);
      setReferralCode(refFromUrl);
    } else {
      setReferralCode(getStoredReferralCode());
    }
  }, []);

  if (isAuthenticated) {
    setLocation(ROUTES.panel);
    return null;
  }

  const validatePassword = (pwd: string): string[] => {
    const issues: string[] = [];
    if (pwd.length < 8) issues.push("Al menos 8 caracteres");
    if (!/[A-Z]/.test(pwd)) issues.push("Una letra mayúscula");
    if (!/[a-z]/.test(pwd)) issues.push("Una letra minúscula");
    if (!/[0-9]/.test(pwd)) issues.push("Un número");
    return issues;
  };

  const passwordIssues = validatePassword(password);
  const isPasswordValid = password.length > 0 && passwordIssues.length === 0;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isPasswordValid) { setError("La contraseña debe cumplir todos los requisitos"); return; }
    if (!passwordsMatch) { setError("Las contraseñas no coinciden"); return; }
    if (!acceptedLegal) { setError("Debes aceptar los términos para crear tu cuenta."); return; }
    setIsLoading(true);
    try {
      await register(name, email, password, {
        consents: { data_processing: true, scoring: true, recommendations: true, marketing: false },
        policyVersion: "1.0",
        ...(referralCode ? { referralCode } : {}),
      });
      toast({ title: "¡Cuenta creada!", description: "Bienvenido a CODA. ¡Comencemos!" });
      Analytics.signupCompleted("persona");
      if (referralCode) {
        Analytics.referralSignup(referralCode);
        clearStoredReferralCode();
      }
      setLocation(ROUTES.panel);
    } catch (err) {
      setError(mapUserFacingApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-[#0a0f1e] text-white p-12 w-1/2 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-indigo-600/10 blur-[80px] pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">CODA</span>
        </div>

        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl font-bold leading-tight mb-4">
              Empieza a conocer{" "}
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                tu salud financiera
              </span>
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Crea tu cuenta gratis y recibe tu primer diagnóstico financiero
              en minutos, basado en tus documentos reales.
            </p>
          </div>
          <ul className="space-y-4">
            {brandFeatures.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-600/10 border border-blue-600/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm text-slate-300 leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
          Chile Open-Data Analytics SpA · RUT 78.389.632-K · Inscripción CMF en trámite
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 lg:w-1/2 flex flex-col justify-center bg-background px-6 py-12 sm:px-12 lg:px-16 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">CODA</span>
        </div>

        <div className="w-full max-w-md mx-auto space-y-7">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Crear cuenta</h1>
            <p className="mt-2 text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link href={ROUTES.iniciarSesion} className="text-blue-600 hover:underline font-medium">
                Iniciar sesión
              </Link>
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                Nombre completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre y apellido"
                  disabled={isLoading}
                  className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            {/* Email */}
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
                  className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password */}
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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-11 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
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
              {password.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <PasswordRequirement met={password.length >= 8} text="8 caracteres mínimo" />
                  <PasswordRequirement met={/[A-Z]/.test(password)} text="Una mayúscula" />
                  <PasswordRequirement met={/[a-z]/.test(password)} text="Una minúscula" />
                  <PasswordRequirement met={/[0-9]/.test(password)} text="Un número" />
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-11 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <PasswordRequirement
                  met={passwordsMatch}
                  text={passwordsMatch ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
                />
              )}
            </div>

            {/* Legal */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => { setAcceptedLegal(e.target.checked); if (e.target.checked) setError(""); }}
                disabled={isLoading}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-blue-600 accent-blue-600"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                He leído y acepto los{" "}
                <a href={ROUTES.terminos} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:no-underline">
                  Términos y Condiciones
                </a>{" "}
                y la{" "}
                <a href={ROUTES.privacidad} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:no-underline">
                  Política de Privacidad
                </a>{" "}
                de CODA.
              </span>
            </label>

            <Button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm"
              disabled={isLoading || !isPasswordValid || !passwordsMatch || !acceptedLegal}
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando cuenta...</>
              ) : (
                "Crear cuenta gratis"
              )}
            </Button>
          </form>

          <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
