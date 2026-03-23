import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wallet, User, Lock, Mail, Loader2, CheckCircle2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [cData, setCData] = useState(false);
  const [cScore, setCScore] = useState(false);
  const [cRec, setCRec] = useState(false);
  const [cMkt, setCMkt] = useState(false);
  const consentsOk = cData && cScore && cRec;

  // Redirect if already authenticated
  if (isAuthenticated) {
    setLocation("/dashboard");
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

    if (!consentsOk) {
      setError("Debes aceptar las tres finalidades obligatorias (tratamiento de datos, scoring y recomendaciones).");
      return;
    }

    setIsLoading(true);

    try {
      await register(name, email, password, {
        consents: {
          data_processing: true,
          scoring: true,
          recommendations: true,
          marketing: cMkt,
        },
        policyVersion: "1.0",
      });
      toast({
        title: "¡Cuenta creada!",
        description: "Bienvenido a CODA. ¡Comencemos!",
      });
      setLocation("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al registrarse";
      setError(message);
      toast({
        title: "Error al crear la cuenta",
        description: message,
        variant: "destructive",
      });
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
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
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
                    placeholder="John Doe"
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
                    placeholder="you@example.com"
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

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Consentimientos (Política v1.0)</p>
                <p className="text-xs text-muted-foreground">
                  Finalidades obligatorias para usar CODA. Puedes revocarlas después desde tu perfil, con los efectos que indique la política.
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox checked={cData} onCheckedChange={(v) => setCData(v === true)} className="mt-0.5" />
                  <span className="text-sm text-gray-700">
                    <strong>Tratamiento de datos personales</strong> — uso de tus datos de cuenta y perfil para operar el servicio.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox checked={cScore} onCheckedChange={(v) => setCScore(v === true)} className="mt-0.5" />
                  <span className="text-sm text-gray-700">
                    <strong>Score crediticio y transaccional</strong> — cálculo de indicadores a partir de la información autorizada.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox checked={cRec} onCheckedChange={(v) => setCRec(v === true)} className="mt-0.5" />
                  <span className="text-sm text-gray-700">
                    <strong>Recomendaciones de productos</strong> — ofertas acordes a tu perfil dentro de la plataforma.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox checked={cMkt} onCheckedChange={(v) => setCMkt(v === true)} className="mt-0.5" />
                  <span className="text-sm text-gray-700">
                    <strong>Comunicaciones comerciales</strong> (opcional) — novedades y promociones por correo o notificaciones.
                  </span>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !isPasswordValid || !passwordsMatch || !consentsOk}
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
            </form>

            {/* Sign In Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
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

        {/* Footer */}
        <p className="text-center text-xs text-gray-500">
          Al crear una cuenta, aceptas nuestros{" "}
          <a href="#" className="underline hover:text-gray-700">Términos de servicio</a>
          {" "}y nuestra{" "}
          <a href="#" className="underline hover:text-gray-700">Política de privacidad</a>
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
