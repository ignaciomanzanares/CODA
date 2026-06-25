/**
 * Onboarding de primer ingreso como WIZARD a pantalla completa (no tarjeta de
 * teléfono). Orden lógico: la cuenta se crea PRIMERO y luego se verifica/asegura,
 * porque el KYC y el 2FA operan sobre una cuenta que ya existe.
 *
 * Dos modos (el mismo componente):
 *  - Usuario NUEVO (no autenticado, /registro con el flag on):
 *      ① Crear cuenta (nombre/email/contraseña + "acepto Términos y Privacidad")
 *      ② Identidad (KYC mock)   ③ Seguridad (2FA)
 *    La cuenta se crea al avanzar del paso ①, con el consentimiento del checkbox.
 *  - Usuario EXISTENTE (autenticado, gate → /verificacion):
 *      ① Términos + consentimiento  ② Identidad  ③ Seguridad
 *    (no se crea cuenta; sólo se registra el consentimiento y se completa).
 *
 * KYC y biometría son MOCK de UI (no se suben imágenes). El consentimiento es real.
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ROUTES } from "@/lib/routes";
import { useAuth, getPersonalToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { mapUserFacingApiError } from "@/lib/userFacingErrors";
import { cn } from "@/lib/utils";
import {
  FileText, ShieldCheck, Camera, CreditCard, KeyRound, QrCode, Check, CheckCircle2,
  ChevronRight, ArrowLeft, Lock, AlertTriangle, Smartphone, ScanLine, Loader2,
  User as UserIcon, Mail, Eye, EyeOff, Wallet, BarChart3, Store,
} from "lucide-react";

async function post(url: string, body?: unknown) {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getPersonalToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const BRAND_FEATURES = [
  { Icon: BarChart3, text: "Score crediticio dual basado en tus datos reales" },
  { Icon: Store, text: "Marketplace de productos financieros (créditos, tarjetas, depósitos, fondos)" },
  { Icon: ShieldCheck, text: "Diseñado bajo la normativa CMF y Ley Fintec" },
];

type StepKey = "account" | "terms" | "kyc" | "2fa";

export default function OnboardingFlow() {
  const [, navigate] = useLocation();
  const { register, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Cuenta PRIMERO para el usuario nuevo; el existente arranca en Términos.
  const stepKeys: StepKey[] = isAuthenticated ? ["terms", "kyc", "2fa"] : ["account", "kyc", "2fa"];
  const LABELS: Record<StepKey, { label: string; Icon: typeof FileText }> = {
    account: { label: "Cuenta", Icon: UserIcon },
    terms: { label: "Términos", Icon: FileText },
    kyc: { label: "Identidad", Icon: ScanLine },
    "2fa": { label: "Seguridad", Icon: ShieldCheck },
  };

  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [front, setFront] = useState(false);
  const [back, setBack] = useState(false);
  const [bio, setBio] = useState(false);
  const [twoFA, setTwoFA] = useState<null | "now" | "later">(null);
  const [totpDone, setTotpDone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pwdIssues = [
    password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password),
  ];
  const pwdValid = pwdIssues.every(Boolean);
  const pwdMatch = password.length > 0 && password === confirm;

  const current = stepKeys[step];
  const isLastStep = step === stepKeys.length - 1;

  const canAdvance =
    current === "account" ? (name.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && pwdValid && pwdMatch && consent)
    : current === "terms" ? consent
    : current === "kyc" ? (front && back && bio)
    : current === "2fa" ? (twoFA !== null && (twoFA !== "now" || totpDone))
    : false;

  async function advance() {
    setError("");
    // Acción del paso 1: crear cuenta (nuevo) o registrar consentimiento (existente).
    setBusy(true);
    try {
      if (current === "account") {
        await register(name.trim(), email.trim(), password, {
          consents: { data_processing: consent, scoring: true, recommendations: true, marketing: false },
          policyVersion: "1.0",
        });
      } else if (current === "terms") {
        await post("/api/privacy-consents/accept", { purpose: "data_processing" });
      }

      if (!isLastStep) {
        setStep((s) => s + 1);
        return;
      }

      // Último paso (2FA) → aplicar KYC mock + 2FA + completar.
      await post("/api/onboarding/kyc");
      if (twoFA === "now") await post("/api/auth/2fa/enable");
      await post("/api/onboarding/complete");
      queryClient.setQueryData(
        ["/api/onboarding/status"],
        (old: Record<string, unknown> | undefined) => ({
          ...(old ?? {}), completed: true,
          twoFactorEnabled: twoFA === "now" ? true : (old?.twoFactorEnabled ?? false),
        }),
      );
      navigate(ROUTES.panel);
    } catch (err) {
      setError(mapUserFacingApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = current === "account" ? "Crear cuenta" : isLastStep ? "Finalizar" : "Continuar";

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-[#0a0f1e] text-white p-12 w-1/2 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
        <div className="relative flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">CODA</span>
        </div>
        <div className="relative space-y-8">
          <h1 className="text-4xl font-bold leading-tight">
            Empieza a conocer <span className="text-blue-400">tu salud financiera</span>
          </h1>
          <p className="text-slate-300 leading-relaxed max-w-md">
            Crea tu cuenta gratis y recibe tu primer diagnóstico financiero en minutos, basado en tus documentos reales.
          </p>
          <div className="space-y-4">
            {BRAND_FEATURES.map(({ Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm text-slate-200">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
          Chile Open-Data Analytics SpA · RUT 78.389.632-K · Inscripción CMF en trámite
        </div>
      </div>

      {/* Right: wizard */}
      <div className="flex-1 lg:w-1/2 flex flex-col justify-center bg-background px-6 py-12 sm:px-12 lg:px-16 overflow-y-auto">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">CODA</span>
        </div>

        <div className="w-full max-w-md mx-auto">
          {/* Stepper */}
          <div className="flex gap-2 mb-8">
            {stepKeys.map((key, i) => {
              const meta = LABELS[key];
              const done = i < step, active = i === step;
              return (
                <div key={key} className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-6 h-6 rounded-full grid place-items-center border-2 shrink-0 text-white",
                      done ? "bg-green-500 border-green-500" : active ? "bg-blue-600 border-blue-600" : "bg-transparent border-border text-muted-foreground",
                    )}>
                      {done ? <Check size={13} /> : <meta.Icon size={13} className={active ? "text-white" : "text-muted-foreground"} />}
                    </div>
                    <span className={cn("text-xs hidden sm:block", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{meta.label}</span>
                  </div>
                  <div className={cn("h-1 rounded mt-2", done ? "bg-green-500" : active ? "bg-blue-600" : "bg-border")} />
                </div>
              );
            })}
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {current === "account" && (
            <AccountStep
              name={name} email={email} password={password} confirm={confirm} consent={consent}
              setName={setName} setEmail={setEmail} setPassword={setPassword} setConfirm={setConfirm} setConsent={setConsent}
              showPwd={showPwd} setShowPwd={setShowPwd} pwdIssues={pwdIssues} pwdMatch={pwdMatch}
            />
          )}
          {current === "terms" && <TermsStep consent={consent} setConsent={setConsent} />}
          {current === "kyc" && <KycStep front={front} back={back} bio={bio} setFront={setFront} setBack={setBack} setBio={setBio} />}
          {current === "2fa" && <TwoFAStep twoFA={twoFA} setTwoFA={setTwoFA} totpDone={totpDone} setTotpDone={setTotpDone} />}

          {/* Nav */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 h-11 rounded-xl border border-border text-foreground/80 font-medium text-sm disabled:opacity-50">
                <ArrowLeft size={16} /> Atrás
              </button>
            )}
            <button type="button" onClick={advance} disabled={!canAdvance || busy}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <>{buttonLabel} <ChevronRight size={17} /></>}
            </button>
          </div>

          {!isAuthenticated && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link href={ROUTES.iniciarSesion} className="text-blue-600 hover:underline font-medium">Iniciar sesión</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{sub}</p>
    </div>
  );
}

function ConsentCheckbox({ consent, setConsent }: { consent: boolean; setConsent: (v: boolean) => void }) {
  return (
    <label className={cn("flex gap-3 items-start p-3.5 rounded-xl cursor-pointer border", consent ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-border")}>
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
      <span className="text-[13px] text-foreground/80 leading-relaxed">
        He leído y acepto los{" "}
        <a href={ROUTES.terminos} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Términos y Condiciones</a>{" "}
        y la{" "}
        <a href={ROUTES.privacidad} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Política de Privacidad</a>{" "}
        de CODA, y autorizo el tratamiento de mis datos personales para prestar el servicio.
      </span>
    </label>
  );
}

function AccountStep({ name, email, password, confirm, consent, setName, setEmail, setPassword, setConfirm, setConsent, showPwd, setShowPwd, pwdIssues, pwdMatch }: {
  name: string; email: string; password: string; confirm: string; consent: boolean;
  setName: (v: string) => void; setEmail: (v: string) => void; setPassword: (v: string) => void; setConfirm: (v: string) => void; setConsent: (v: boolean) => void;
  showPwd: boolean; setShowPwd: (v: boolean) => void; pwdIssues: boolean[]; pwdMatch: boolean;
}) {
  const inputCls = "flex h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  return (
    <>
      <StepHeading title="Crea tu cuenta" sub="Empieza gratis. Luego verificamos tu identidad y aseguramos tu cuenta." />
      <div className="space-y-4">
        <div className="relative">
          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" className={inputCls} />
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="tu@correo.cl" autoComplete="email" className={inputCls} />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPwd ? "text" : "password"} placeholder="Contraseña" autoComplete="new-password" className={inputCls + " pr-11"} />
          <button type="button" onClick={() => setShowPwd(!showPwd)} tabIndex={-1} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground">
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type={showPwd ? "text" : "password"} placeholder="Confirmar contraseña" autoComplete="new-password" className={inputCls} />
        </div>
        {password.length > 0 && (
          <div className="grid grid-cols-2 gap-1">
            {[["8 caracteres", pwdIssues[0]], ["Una mayúscula", pwdIssues[1]], ["Una minúscula", pwdIssues[2]], ["Un número", pwdIssues[3]]].map(([t, ok]) => (
              <div key={t as string} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-green-600" : "text-muted-foreground")}>
                <CheckCircle2 className={cn("h-3 w-3 shrink-0", ok ? "text-green-500" : "text-muted-foreground/50")} /> {t as string}
              </div>
            ))}
            {confirm.length > 0 && (
              <div className={cn("flex items-center gap-1.5 text-xs col-span-2", pwdMatch ? "text-green-600" : "text-red-500")}>
                <CheckCircle2 className={cn("h-3 w-3 shrink-0", pwdMatch ? "text-green-500" : "text-red-400")} /> {pwdMatch ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
              </div>
            )}
          </div>
        )}
        <ConsentCheckbox consent={consent} setConsent={setConsent} />
      </div>
    </>
  );
}

function TermsStep({ consent, setConsent }: { consent: boolean; setConsent: (v: boolean) => void }) {
  return (
    <>
      <StepHeading title="Condiciones de uso" sub="Revisa cómo usamos tus datos y autoriza el tratamiento para prestarte el servicio." />
      <div className="border border-border rounded-xl p-4 max-h-36 overflow-y-auto bg-muted/40 text-[13px] text-muted-foreground leading-relaxed space-y-2">
        <p><b className="text-foreground/80">1. Servicio.</b> CODA analiza la información que cargas para calcular tus indicadores de salud financiera y recomendarte productos. El uso es gratuito para ti.</p>
        <p><b className="text-foreground/80">2. Datos.</b> Tratamos tus datos personales solo en la medida necesaria para prestar el servicio, conforme a la normativa vigente.</p>
        <p><b className="text-foreground/80">3. Tus derechos.</b> Puedes revocar tu autorización y solicitar la eliminación de tus datos en cualquier momento.</p>
      </div>
      <div className="mt-4">
        <ConsentCheckbox consent={consent} setConsent={setConsent} />
      </div>
    </>
  );
}

function KycStep({ front, back, bio, setFront, setBack, setBio }: {
  front: boolean; back: boolean; bio: boolean; setFront: (v: boolean) => void; setBack: (v: boolean) => void; setBio: (v: boolean) => void;
}) {
  return (
    <>
      <StepHeading title="Verifica tu identidad" sub="Se realiza una sola vez. Es requisito para operar con datos bancarios." />
      <p className="text-[12px] text-muted-foreground mb-3 flex items-center gap-1.5"><Lock size={12} /> Tus imágenes se cifran · una única vez</p>
      <div className="grid gap-2.5">
        <CaptureCard Icon={CreditCard} title="Cédula — frente" done={front} onClick={() => setFront(true)} />
        <CaptureCard Icon={CreditCard} title="Cédula — reverso" done={back} onClick={() => setBack(true)} />
        <CaptureCard Icon={Camera} title="Verificación biométrica" hint="Selfie con prueba de vida" done={bio} onClick={() => setBio(true)} />
      </div>
    </>
  );
}

function CaptureCard({ Icon, title, hint, done, onClick }: { Icon: typeof CreditCard; title: string; hint?: string; done: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(
      "w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all border",
      done ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-dashed border-border",
    )}>
      <span className={cn("w-10 h-10 rounded-xl flex-shrink-0 grid place-items-center", done ? "bg-green-500 text-white" : "bg-blue-600/10 text-blue-600")}>
        {done ? <Check size={20} /> : <Icon size={20} />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className={cn("text-xs", done ? "text-green-600" : "text-muted-foreground")}>{done ? "Capturado" : hint || "Tomar foto"}</span>
      </span>
      {!done && <ChevronRight size={17} className="text-muted-foreground ml-auto" />}
    </button>
  );
}

function TwoFAStep({ twoFA, setTwoFA, totpDone, setTotpDone }: {
  twoFA: null | "now" | "later"; setTwoFA: (v: "now" | "later") => void; totpDone: boolean; setTotpDone: (v: boolean) => void;
}) {
  return (
    <>
      <StepHeading title="Doble factor (2FA)" sub="Protege tu cuenta con un segundo factor mediante una app de autenticación." />
      <div className="flex gap-2.5 items-start p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 mb-4">
        <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <span className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Es <b>obligatorio</b> antes de vincular cuentas bancarias. Puedes activarlo ahora o más tarde.
        </span>
      </div>
      <div className="grid gap-2.5">
        <ChoiceCard Icon={KeyRound} title="Activar ahora" hint="App de autenticación (TOTP)" active={twoFA === "now"} onClick={() => setTwoFA("now")} />
        <ChoiceCard Icon={Smartphone} title="Más tarde" hint="Te lo pediremos antes de conectar un banco" active={twoFA === "later"} onClick={() => { setTwoFA("later"); setTotpDone(false); }} />
      </div>
      {twoFA === "now" && (
        <div className="mt-4 p-4 rounded-xl border border-border bg-muted/40">
          <p className="text-[13px] text-muted-foreground mb-3">Escanea el código con tu app (Google/Microsoft Authenticator) e ingresa los 6 dígitos.</p>
          <div className="flex gap-4 items-center">
            <div className="w-[88px] h-[88px] rounded-xl bg-background border border-border grid place-items-center"><QrCode size={56} className="text-foreground" /></div>
            <div className="flex-1">
              <div className="flex gap-1.5">
                {[0,1,2,3,4,5].map((i) => (
                  <div key={i} className={cn("flex-1 h-9 rounded-lg border grid place-items-center font-bold text-foreground", totpDone ? "border-green-500" : "border-border")}>{totpDone ? "•" : ""}</div>
                ))}
              </div>
              <button type="button" onClick={() => setTotpDone(true)} className={cn(
                "mt-2.5 w-full py-2 rounded-lg font-bold text-[12.5px] flex items-center justify-center gap-1.5",
                totpDone ? "bg-green-50 dark:bg-green-950/30 text-green-600" : "bg-foreground text-background")}>
                {totpDone ? <><CheckCircle2 size={15} /> Verificado</> : "Simular código válido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChoiceCard({ Icon, title, hint, active, onClick }: { Icon: typeof KeyRound; title: string; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(
      "w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all border", active ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-border")}>
      <span className={cn("w-10 h-10 rounded-xl flex-shrink-0 grid place-items-center", active ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground")}><Icon size={20} /></span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={cn("ml-auto w-5 h-5 rounded-full flex-shrink-0 border-2 grid place-items-center", active ? "border-blue-600 bg-blue-600" : "border-muted-foreground")}>
        {active && <Check size={12} className="text-white" />}
      </span>
    </button>
  );
}
