import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wallet, User, Lock, Mail, Loader2, CheckCircle2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { mapUserFacingApiError } from "@/lib/userFacingErrors";
import { Analytics } from "@/lib/analytics";

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

  // Redirect if already authenticated
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

    if (!isPasswordValid) {
      setError("La contraseña debe cumplir todos los requisitos");
      return;
    }

    if (!passwordsMatch) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!acceptedLegal) {
      setError("Debes aceptar los términos para crear tu cuenta.");
      return;
    }

    setIsLoading(true);

    try {
      await register(name, email, password, {
        consents: {
          data_processing: true,
          scoring: true,
          recommendations: true,
          marketing: false,
        },
        policyVersion: "1.0",
      });
      toast({
        title: "¡Cuenta creada!",
        description: "Bienvenido a CODA. ¡Comencemos!",
      });
      Analytics.signupCompleted("persona");
      setLocation(ROUTES.panel);
    } catch (err) {
      setError(mapUserFacingApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo & Title */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary rounded-xl flex items-center justify-center shadow-lg">
            <Wallet className="h-9 w-9 text-primary-foreground" />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-gray-900">
            Crear cuenta
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Comienza tu camino financiero con CODA
          </p>
        </div>

        {/* Sign Up Form */}
        <Card>
          <CardHeader>
            <CardTitle>Registro</CardTitle>
            <CardDescription>
              Crea tu cuenta gratuita para comenzar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626] animate-in fade-in duration-200"
                >
                  {error}
                </div>
              )}
              
              {/* Name */}
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nombre completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  />
                </div>
              </div>
              
              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
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
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-11 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-500 hover:text-gray-800 hover:bg-muted/80"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={isLoading}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                {/* Password Requirements */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <PasswordRequirement met={password.length >= 8} text="Al menos 8 caracteres" />
                    <PasswordRequirement met={/[A-Z]/.test(password)} text="Una letra mayúscula" />
                    <PasswordRequirement met={/[a-z]/.test(password)} text="Una letra minúscula" />
                    <PasswordRequirement met={/[0-9]/.test(password)} text="Un número" />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
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
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-11 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-gray-500 hover:text-gray-800 hover:bg-muted/80"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    disabled={isLoading}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <PasswordRequirement 
                    met={passwordsMatch} 
                    text={passwordsMatch ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"} 
                  />
                )}
              </div>

              <Button
                type="submit"
                className="w-full disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || !isPasswordValid || !passwordsMatch || !acceptedLegal}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  'Crear cuenta'
                )}
              </Button>

              <label className="mt-4 flex items-start gap-2 cursor-pointer text-xs leading-relaxed text-[#64748b]">
                <input
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(e) => {
                    setAcceptedLegal(e.target.checked);
                    if (e.target.checked) setError("");
                  }}
                  disabled={isLoading}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-input"
                />
                <span>
                  He leído y acepto los{" "}
                  <a
                    href={ROUTES.terminos}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    Términos y Condiciones
                  </a>{" "}
                  y la{" "}
                  <a
                    href={ROUTES.privacidad}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    Política de Privacidad
                  </a>{" "}
                  de CODA, incluyendo el tratamiento de mis datos para operar el servicio.
                </span>
              </label>
            </form>

            {/* Sign In Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                ¿Ya tienes cuenta?{" "}
                <Link href={ROUTES.iniciarSesion} className="font-medium text-primary hover:underline">
                  Iniciar sesión
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver al inicio
          </Link>
        </div>

        <p className="text-center text-xs text-gray-500">
          © {new Date().getFullYear()} CODA. Todos los derechos reservados.
        </p>

      </div>
    </div>
  );
}

// Password Requirement Component
function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-green-600' : 'text-gray-500'}`}>
      <CheckCircle2 className={`h-3 w-3 ${met ? 'text-green-600' : 'text-gray-300'}`} />
      {text}
    </div>
  );
}
