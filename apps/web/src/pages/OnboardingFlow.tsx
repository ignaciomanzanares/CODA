/**
 * Onboarding de primer ingreso — 3 pasos: Términos+consentimiento (real) →
 * Identidad/KYC (mock de UI) → 2FA. Detrás del flag FEATURES.onboarding.
 * Sigue el orden y la UI del mock (paleta investor deck: naranjo + negro).
 *
 * Real: el consentimiento se registra en privacy_consent_events
 * (POST /api/privacy-consents/accept, purpose data_processing).
 * Mock: KYC (no sube imágenes) y, si no hay TOTP real, el 2FA marca el flag.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ROUTES } from "@/lib/routes";
import { useApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FileText, ShieldCheck, Camera, CreditCard, KeyRound, QrCode, Check, CheckCircle2,
  ChevronRight, ArrowLeft, Lock, AlertTriangle, Smartphone, ScanLine, Loader2,
} from "lucide-react";

const STEPS = [
  { key: "terms", label: "Términos", Icon: FileText },
  { key: "kyc", label: "Identidad", Icon: ScanLine },
  { key: "2fa", label: "Seguridad", Icon: ShieldCheck },
] as const;

export default function OnboardingFlow() {
  const [, navigate] = useLocation();
  const { apiRequest } = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [front, setFront] = useState(false);
  const [back, setBack] = useState(false);
  const [bio, setBio] = useState(false);
  const [twoFA, setTwoFA] = useState<null | "now" | "later">(null);
  const [totpDone, setTotpDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  async function acceptTerms() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/privacy-consents/accept", { purpose: "data_processing" });
      setStep(1);
    } catch {
      toast({ title: "No se pudo registrar el consentimiento", description: "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitKyc() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/onboarding/kyc");
      setStep(2);
    } catch {
      toast({ title: "No se pudo guardar la verificación", description: "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      if (twoFA === "now") await apiRequest("POST", "/api/auth/2fa/enable");
      await apiRequest("POST", "/api/onboarding/complete");
      // Actualiza la caché ANTES de navegar para que el gate de /panel no
      // redirija de vuelta (la refetch en background confirma luego).
      queryClient.setQueryData(
        ["/api/onboarding/status"],
        (old: Record<string, unknown> | undefined) => ({
          ...(old ?? {}),
          completed: true,
          twoFactorEnabled: twoFA === "now" ? true : (old?.twoFactorEnabled ?? false),
        }),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      navigate(ROUTES.panel);
    } catch {
      toast({ title: "No se pudo finalizar", description: "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 px-3 py-6 flex items-start justify-center">
      <div className="w-full max-w-md bg-card rounded-3xl shadow-xl border border-border overflow-hidden">
        {/* header marca */}
        <div className="bg-foreground text-background px-5 py-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-primary grid place-items-center font-extrabold text-sm text-primary-foreground">C</span>
          <span className="font-bold tracking-wide text-sm">CODA</span>
          <span className="ml-auto text-[11px] text-background/60">Crear cuenta</span>
        </div>

        <Stepper idx={step} />

        <div className="px-5 pb-6 pt-1">
          {step === 0 && (
            <Terms consent={consent} setConsent={setConsent} busy={busy} onNext={acceptTerms} />
          )}
          {step === 1 && (
            <Kyc
              front={front} back={back} bio={bio}
              setFront={setFront} setBack={setBack} setBio={setBio}
              busy={busy} onBack={goBack} onNext={submitKyc}
            />
          )}
          {step === 2 && (
            <TwoFA
              twoFA={twoFA} setTwoFA={setTwoFA} totpDone={totpDone} setTotpDone={setTotpDone}
              busy={busy} onBack={goBack} onFinish={finish}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ idx }: { idx: number }) {
  return (
    <div className="flex px-5 pt-4 pb-1 gap-1.5">
      {STEPS.map((s, i) => {
        const active = i === idx, done = i < idx;
        const Icon = s.Icon;
        return (
          <div key={s.key} className="flex-1">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-[22px] h-[22px] rounded-full grid place-items-center border-2 flex-shrink-0",
                done ? "bg-emerald-500 border-emerald-500 text-white"
                  : active ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card border-border text-muted-foreground",
              )}>
                {done ? <Check size={12} /> : <Icon size={12} />}
              </div>
              <span className={cn("text-[11px]", active ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>{s.label}</span>
            </div>
            <div className={cn("h-[3px] rounded mt-2", done ? "bg-emerald-500" : active ? "bg-primary" : "bg-border")} />
          </div>
        );
      })}
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mt-3.5 mb-3.5">
      <h2 className="text-lg font-extrabold text-foreground leading-tight">{title}</h2>
      <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{sub}</p>
    </div>
  );
}

function PrimaryBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full px-4 py-3.5 rounded-xl border-none bg-primary text-primary-foreground font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="px-3.5 py-3 rounded-xl border border-border bg-card text-foreground/80 font-semibold text-sm flex items-center gap-1.5">
      {children}
    </button>
  );
}

function LinkRow({ Icon, children, path, tbd }: { Icon: typeof FileText; children: React.ReactNode; path?: string; tbd?: boolean }) {
  const inner = (
    <span className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card text-left">
      <Icon size={17} className="text-primary flex-shrink-0" />
      <span className="min-w-0">
        <span className="block text-[13.5px] text-foreground/80 font-semibold">{children}</span>
        {(path || tbd) && (
          <span className={cn("text-[11px] font-mono", tbd ? "text-amber-500" : "text-muted-foreground")}>
            {tbd ? "próximamente · no existe aún" : path}
          </span>
        )}
      </span>
      <ChevronRight size={16} className="text-muted-foreground ml-auto flex-shrink-0" />
    </span>
  );
  if (tbd || !path) return <div className="opacity-70 cursor-default">{inner}</div>;
  return <a href={path} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">{inner}</a>;
}

/* ---------- Paso 1: Términos + consentimiento (real) ---------- */
function Terms({ consent, setConsent, busy, onNext }: {
  consent: boolean; setConsent: (v: boolean) => void; busy: boolean; onNext: () => void;
}) {
  return (
    <>
      <Heading title="Condiciones de uso" sub="Antes de empezar, revisa cómo usamos tus datos y autoriza el tratamiento para prestarte el servicio." />

      <div className="border border-border rounded-xl p-3.5 max-h-[132px] overflow-y-auto bg-muted/40 text-[12.5px] text-muted-foreground leading-relaxed space-y-2">
        <p><b className="text-foreground/80">1. Servicio.</b> CODA analiza la información que cargas (cartolas, documentos) para calcular tus indicadores de salud financiera y recomendarte productos. El uso es gratuito para ti.</p>
        <p><b className="text-foreground/80">2. Datos.</b> Tratamos tus datos personales solo en la medida necesaria para prestar el servicio, conforme a la normativa vigente.</p>
        <p><b className="text-foreground/80">3. Tus derechos.</b> Puedes revocar tu autorización y solicitar la eliminación de tus datos en cualquier momento.</p>
      </div>

      <div className="grid gap-2 mt-3">
        <LinkRow Icon={FileText} path={ROUTES.terminos}>Términos y Condiciones de uso</LinkRow>
        <LinkRow Icon={Lock} path={ROUTES.privacidad}>Política de Privacidad y Tratamiento de Datos</LinkRow>
        <LinkRow Icon={ShieldCheck} tbd>Seguridad · Reportar un problema</LinkRow>
      </div>

      <label className={cn(
        "flex gap-3 items-start mt-4 p-3.5 rounded-xl cursor-pointer border-[1.5px] transition-all",
        consent ? "border-primary bg-primary/10" : "border-border bg-card",
      )}>
        <span className={cn(
          "w-[22px] h-[22px] rounded-md flex-shrink-0 mt-0.5 border-2 grid place-items-center",
          consent ? "border-primary bg-primary" : "border-muted-foreground bg-card",
        )}>{consent && <Check size={14} className="text-primary-foreground" />}</span>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="hidden" />
        <span className="text-[12.5px] text-foreground/80 leading-relaxed">
          Autorizo a <b>Chile Open-Data Analytics SpA (CODA)</b> el tratamiento de mis datos personales para las finalidades descritas en la <b className="text-primary">Política de Privacidad</b>, en la medida necesaria para prestar el servicio.
        </span>
      </label>

      <div className="mt-4">
        <PrimaryBtn disabled={!consent || busy} onClick={onNext}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <>Aceptar y continuar <ChevronRight size={17} /></>}
        </PrimaryBtn>
      </div>
    </>
  );
}

/* ---------- Paso 2: KYC (mock) ---------- */
function Kyc({ front, back, bio, setFront, setBack, setBio, busy, onBack, onNext }: {
  front: boolean; back: boolean; bio: boolean;
  setFront: (v: boolean) => void; setBack: (v: boolean) => void; setBio: (v: boolean) => void;
  busy: boolean; onBack: () => void; onNext: () => void;
}) {
  const ready = front && back && bio;
  return (
    <>
      <Heading title="Verifica tu identidad" sub="Verificamos tu identidad una sola vez. Es requisito para operar con datos bancarios." />
      <p className="text-[11.5px] text-muted-foreground -mt-1 mb-3 flex items-center gap-1.5">
        <Lock size={12} /> Se realiza una única vez · tus imágenes se cifran
      </p>
      <div className="grid gap-2.5">
        <CaptureCard Icon={CreditCard} title="Cédula — frente" done={front} onClick={() => setFront(true)} />
        <CaptureCard Icon={CreditCard} title="Cédula — reverso" done={back} onClick={() => setBack(true)} />
        <CaptureCard Icon={Camera} title="Verificación biométrica" hint="Selfie con prueba de vida" done={bio} onClick={() => setBio(true)} />
      </div>
      <div className="flex gap-2.5 mt-4">
        <GhostBtn onClick={onBack}><ArrowLeft size={16} /> Atrás</GhostBtn>
        <div className="flex-1">
          <PrimaryBtn disabled={!ready || busy} onClick={onNext}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <>Continuar <ChevronRight size={17} /></>}
          </PrimaryBtn>
        </div>
      </div>
    </>
  );
}

function CaptureCard({ Icon, title, hint, done, onClick }: {
  Icon: typeof CreditCard; title: string; hint?: string; done: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn(
      "w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all border-[1.5px]",
      done ? "border-solid border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-dashed border-border bg-card",
    )}>
      <span className={cn("w-10 h-10 rounded-xl flex-shrink-0 grid place-items-center",
        done ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary")}>
        {done ? <Check size={20} /> : <Icon size={20} />}
      </span>
      <span>
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className={cn("text-xs", done ? "text-emerald-600" : "text-muted-foreground")}>{done ? "Capturado" : hint || "Tomar foto"}</span>
      </span>
      {!done && <ChevronRight size={17} className="text-muted-foreground ml-auto" />}
    </button>
  );
}

/* ---------- Paso 3: 2FA ---------- */
function TwoFA({ twoFA, setTwoFA, totpDone, setTotpDone, busy, onBack, onFinish }: {
  twoFA: null | "now" | "later"; setTwoFA: (v: "now" | "later") => void;
  totpDone: boolean; setTotpDone: (v: boolean) => void;
  busy: boolean; onBack: () => void; onFinish: () => void;
}) {
  return (
    <>
      <Heading title="Doble factor (2FA)" sub="Protege tu cuenta con un segundo factor mediante una app de autenticación." />
      <div className="flex gap-2.5 items-start p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 mb-3.5">
        <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <span className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Es <b>obligatorio</b> antes de vincular cuentas bancarias. Puedes activarlo ahora o más tarde.
        </span>
      </div>
      <div className="grid gap-2.5">
        <ChoiceCard Icon={KeyRound} title="Activar ahora" hint="App de autenticación (TOTP)"
          active={twoFA === "now"} onClick={() => setTwoFA("now")} />
        <ChoiceCard Icon={Smartphone} title="Más tarde" hint="Te lo pediremos antes de conectar un banco"
          active={twoFA === "later"} onClick={() => { setTwoFA("later"); setTotpDone(false); }} />
      </div>

      {twoFA === "now" && (
        <div className="mt-3.5 p-4 rounded-xl border border-border bg-muted/40">
          <p className="text-[12.5px] text-muted-foreground mb-3 leading-relaxed">
            Escanea el código con tu app (Google/Microsoft Authenticator) e ingresa el código de 6 dígitos.
          </p>
          <div className="flex gap-3.5 items-center">
            <div className="w-[88px] h-[88px] rounded-xl bg-card border border-border grid place-items-center">
              <QrCode size={56} className="text-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex gap-1.5">
                {[0,1,2,3,4,5].map((i) => (
                  <div key={i} className={cn("flex-1 h-[38px] rounded-lg border bg-card grid place-items-center font-bold text-foreground",
                    totpDone ? "border-emerald-500" : "border-border")}>{totpDone ? "•" : ""}</div>
                ))}
              </div>
              <button onClick={() => setTotpDone(true)} className={cn(
                "mt-2.5 w-full py-2.5 rounded-lg border-none font-bold text-[12.5px] flex items-center justify-center gap-1.5",
                totpDone ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" : "bg-foreground text-background")}>
                {totpDone ? <><CheckCircle2 size={15} /> Verificado</> : "Simular código válido"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 mt-4">
        <GhostBtn onClick={onBack}><ArrowLeft size={16} /> Atrás</GhostBtn>
        <div className="flex-1">
          <PrimaryBtn disabled={!twoFA || (twoFA === "now" && !totpDone) || busy} onClick={onFinish}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <>Finalizar <ChevronRight size={17} /></>}
          </PrimaryBtn>
        </div>
      </div>
    </>
  );
}

function ChoiceCard({ Icon, title, hint, active, onClick }: {
  Icon: typeof KeyRound; title: string; hint: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn(
      "w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all border-[1.5px]",
      active ? "border-primary bg-primary/10" : "border-border bg-card")}>
      <span className={cn("w-10 h-10 rounded-xl flex-shrink-0 grid place-items-center",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Icon size={20} /></span>
      <span>
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={cn("ml-auto w-5 h-5 rounded-full flex-shrink-0 border-2 grid place-items-center",
        active ? "border-primary bg-primary" : "border-muted-foreground bg-card")}>
        {active && <Check size={12} className="text-primary-foreground" />}
      </span>
    </button>
  );
}
