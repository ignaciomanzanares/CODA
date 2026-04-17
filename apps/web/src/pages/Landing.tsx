import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Activity,
  ShoppingBag,
  Target,
  Users,
  Building2,
  Lock,
  Shield,
  FileText,
  Zap,
  TrendingUp,
  ChevronRight,
  CheckCircle2,
  Eye,
  Scale,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { Analytics } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

/* ── Animated score gauge ─────────────────────────────────────────── */
function ScoreGauge({
  label,
  target,
  max,
  size = 120,
  strokeWidth = 10,
  tag,
}: {
  label: string;
  target: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  tag: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          // Animate from 0 to target over ~1.2s
          const start = performance.now();
          const duration = 1200;
          function tick(now: number) {
            const t = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
            setValue(Math.round(ease * target));
            if (t < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = value / max;
  const offset = circ * (1 - pct);

  return (
    <div ref={ref} className="flex flex-col items-center">
      <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">{label}</p>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#3b82f6" strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-100"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{value}</span>
          <span className="text-[10px] text-slate-500">/{max}</span>
        </div>
      </div>
      <span className="mt-2 text-xs font-semibold text-blue-400">{tag}</span>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation(ROUTES.panel);
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0a0f1e] text-white">
        {/* Dot pattern background */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Blue glow */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none" />

        <div className="relative container mx-auto px-4 py-24 md:py-32 lg:py-40">
          <div className="grid lg:grid-cols-5 gap-16 items-center max-w-6xl mx-auto">

            {/* Left 60%: Copy */}
            <div className="lg:col-span-3 space-y-8">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight">
                {t("landing.heroTitle")}{" "}
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  {t("landing.heroTitleHighlight")}
                </span>
              </h1>

              <p className="text-lg md:text-xl text-slate-300 leading-relaxed max-w-xl">
                {t("landing.heroSubtitle")}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={ROUTES.registro}>
                  <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] text-white font-semibold px-8 h-12 text-base shadow-lg shadow-blue-600/25 transition-all"
                    onClick={() => Analytics.signupStarted()}
                  >
                    {t("landing.getStarted")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <a href="#como-funciona">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:border-white/40 h-12 text-base backdrop-blur-sm"
                  >
                    {t("landing.learnMore")}
                  </Button>
                </a>
              </div>

              {/* Trust strip */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400 pt-2">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                  Regulado bajo Ley Fintec 21.521
                </span>
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-slate-500 shrink-0" />
                  Metodología CMF NCG 502
                </span>
                <span className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-slate-500 shrink-0" />
                  Hecho en Chile
                </span>
              </div>
            </div>

            {/* Right 40%: Score card mockup */}
            <div className="lg:col-span-2 hidden lg:flex items-center justify-center">
              <div className="relative w-full max-w-sm">
                <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Vista previa</p>
                    <span className="text-[10px] text-blue-400/60 bg-blue-500/10 rounded-full px-2 py-0.5">Demo</span>
                  </div>

                  <div className="grid grid-cols-2 gap-6 py-4">
                    <ScoreGauge label="Score crediticio" target={720} max={850} tag="Muy bueno" />
                    <ScoreGauge label="Salud transaccional" target={78} max={100} size={120} tag="Buena" />
                  </div>

                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[
                      { label: "Ingresos", val: "$1.250.000", color: "text-green-400" },
                      { label: "Gastos", val: "$890.000", color: "text-red-400" },
                      { label: "Ahorro", val: "28.8%", color: "text-blue-400" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-slate-900/50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${color}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating badges */}
                <div className="absolute -top-4 -right-4 bg-blue-600 text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg shadow-blue-600/40">
                  Score dual
                </div>
                <div className="absolute -bottom-4 -left-4 bg-slate-800 border border-slate-600 text-white text-xs rounded-xl px-3 py-2 shadow-lg">
                  <p className="text-slate-400 text-[10px]">Recomendación</p>
                  <p className="font-medium">Portabilidad hipotecaria</p>
                  <p className="text-green-400 text-[10px]">Ahorro estimado: $45.000/mes</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-8 md:h-12">
            <path d="M0 60L480 20C720 0 960 0 1440 20V60H0Z" className="fill-slate-50 dark:fill-slate-900" />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          2. TRUST BAR
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-8 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs text-slate-400 uppercase tracking-widest mb-4">Construido con datos de</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-slate-400">
            {["CMF Chile", "Banco Central", "SBIF (ex)", "SII"].map((name) => (
              <span key={name} className="text-sm font-medium tracking-wide opacity-60 hover:opacity-100 transition-opacity">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          3. HOW IT WORKS
          ═══════════════════════════════════════════════════════════════ */}
      <section id="como-funciona" className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Proceso</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {t("landing.howItWorksTitle")}
            </h2>
            <p className="text-lg text-gray-500 dark:text-slate-400">{t("landing.howItWorksSubtitle")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { n: "01", icon: FileText, title: t("landing.step1Title"), desc: t("landing.step1Desc") },
              { n: "02", icon: Zap, title: t("landing.step2Title"), desc: t("landing.step2Desc") },
              { n: "03", icon: TrendingUp, title: t("landing.step3Title"), desc: t("landing.step3Desc") },
            ].map(({ n, icon: Icon, title, desc }, i) => (
              <div key={n} className="relative flex flex-col items-center text-center">
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-0 h-px border-t-2 border-dashed border-blue-200 dark:border-blue-800" />
                )}
                <div className="relative mb-6">
                  <span className="absolute -top-3 -right-3 text-6xl font-black text-blue-50 dark:text-blue-950 select-none leading-none">{n}</span>
                  <div className="relative w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 flex items-center justify-center">
                    <Icon className="h-7 w-7 text-blue-600" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          4. DUAL SCORE EXPLAINER
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="relative container mx-auto px-4">
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <p className="text-blue-200 font-semibold text-sm uppercase tracking-widest mb-3">Score dual</p>
            <h2 className="text-4xl md:text-5xl font-bold leading-tight">
              Dos lentes complementarios para tu salud financiera
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Credit score */}
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-bold">Score Crediticio Tradicional</h3>
              </div>
              <p className="text-3xl font-bold text-white mb-1">0 – 850</p>
              <p className="text-blue-100 leading-relaxed">
                Basado en tu historial de deudas reportado a la CMF. Mide cuánto debes, a cuántas instituciones
                y tu comportamiento de pago histórico. Es el score que los bancos ya conocen.
              </p>
            </div>

            {/* Transactional score */}
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-bold">Salud Transaccional</h3>
              </div>
              <p className="text-3xl font-bold text-white mb-1">0 – 100</p>
              <p className="text-blue-100 leading-relaxed">
                Basado en tus movimientos reales: tasa de ahorro, diversificación de ingresos,
                regularidad de gastos y más. Metodología Hjelkrem 2022 adaptada a Chile.
              </p>
            </div>
          </div>

          <p className="text-center text-blue-100 mt-10 max-w-2xl mx-auto text-lg">
            Juntos, te dan la primera radiografía completa de tu situación financiera en Chile.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          5. FEATURES GRID (6 cards)
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Funcionalidades</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Todo lo que necesitas para tus finanzas
            </h2>
            <p className="text-lg text-gray-500 dark:text-slate-400">
              Diagnóstico, scoring, comparación y recomendación. Todo basado en tus datos reales.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: BarChart3,
                title: "Diagnóstico automatizado",
                desc: "Análisis de ingresos, gastos, deudas y liquidez. Tu situación financiera completa en un solo lugar.",
                color: "blue",
              },
              {
                icon: Activity,
                title: "Gestión de gastos",
                desc: "Categorización automática de tus movimientos. Visualiza dónde va tu dinero y detecta patrones.",
                color: "emerald",
              },
              {
                icon: Target,
                title: "Metas financieras",
                desc: "Define objetivos de ahorro, inversión o pago de deuda. CODA te muestra el progreso mes a mes.",
                color: "orange",
              },
              {
                icon: ShoppingBag,
                title: "Comparador de productos",
                desc: "Compara créditos, tarjetas, cuentas y seguros de los principales bancos chilenos. Datos reales de la CMF.",
                color: "violet",
              },
              {
                icon: Users,
                title: "Dividir cuentas con amigos",
                desc: "Divide gastos compartidos, envía invitaciones por email y lleva el control de quién ha pagado.",
                color: "pink",
              },
              {
                icon: Building2,
                title: "CODA Empresas",
                desc: "Conciliación bancaria, gestión de DTE y análisis de riesgo empresarial. Para PYMEs chilenas.",
                color: "slate",
                badge: "Próximamente",
              },
            ].map(({ icon: Icon, title, desc, color, badge }) => {
              const bg: Record<string, string> = {
                blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
                emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                orange: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
                violet: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
                pink: "bg-pink-50 text-pink-600 dark:bg-pink-950 dark:text-pink-400",
                slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
              };
              return (
                <div
                  key={title}
                  className="group p-6 rounded-2xl border border-gray-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-500/50 hover:shadow-md hover:-translate-y-0.5 transition-all bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${bg[color]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {badge && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        {badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          6. REGULATORY / TRUST SECTION
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-[#0a0f1e] text-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Regulado, transparente, chileno.
            </h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                icon: Scale,
                text: "Inscrito en el RPSF de la CMF (en trámite) bajo Ley 21.521.",
              },
              {
                icon: Eye,
                text: "Algoritmos con trazabilidad NCG 502. Publicamos nuestra metodología.",
              },
              {
                icon: Lock,
                text: "Tus datos viven encriptados. Nunca los vendemos.",
              },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-4 p-5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-base text-slate-300 leading-relaxed pt-1.5">{text}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/metodologia">
              <Button variant="link" className="text-blue-400 hover:text-blue-300 gap-1 text-base">
                Leer nuestra metodología completa <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          7. CTA FOOTER BLOCK
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            {t("landing.ctaTitle")}
          </h2>
          <Link href={ROUTES.registro}>
            <Button
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 hover:scale-[1.02] font-semibold px-10 h-14 text-lg shadow-xl shadow-blue-900/30 transition-all"
              onClick={() => Analytics.signupStarted()}
            >
              {t("landing.createAccount")}
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="mt-5 text-blue-200 text-sm">
            {t("landing.noPaymentRequired")}
          </p>
        </div>
      </section>
    </div>
  );
}
