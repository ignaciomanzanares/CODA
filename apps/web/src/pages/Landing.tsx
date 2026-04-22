import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import ScoreExpressWidget from "@/components/ScoreExpressWidget";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowLeftRight,
  BarChart3,
  Activity,
  Store,
  Target,
  Bell,
  Lock,
  Landmark,
  CreditCard,
  Banknote,
  Wallet,
  Home,
  PiggyBank,
  TrendingUp,
  Shield,
  DollarSign,
  CheckCircle2,
  ChevronRight,
  Zap,
  FileText,
  HelpCircle,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ROUTES } from "@/lib/routes";
import { Analytics } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

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

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0a0f1e] text-white">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.8) 1px,transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Blue glow */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none" />

        <div className="relative container mx-auto px-4 py-24 md:py-32 lg:py-40">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">

            {/* Left: Copy */}
            <div className="space-y-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-300 rounded-full px-4 py-1.5 text-sm font-medium">
                <span className="text-base">🇨🇱</span>
                Hecho en Chile · Open Finance
              </div>

              {/* Headline */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
                {t("landing.heroTitle")}{" "}
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  {t("landing.heroTitleHighlight")}
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-lg md:text-xl text-slate-300 leading-relaxed max-w-lg">
                {t("landing.heroSubtitle")}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={ROUTES.registro}>
                  <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 h-12 text-base shadow-lg shadow-blue-600/25 transition-all"
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
                    className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:border-white/40 h-12 text-base backdrop-blur-sm"
                  >
                    {t("landing.learnMore")}
                  </Button>
                </a>
              </div>

              {/* Trust line */}
              <div className="flex flex-wrap items-center gap-5 text-sm text-slate-400">
                {["Gratuito para siempre", "Sin tarjeta de crédito", "Datos reales", "Privacidad garantizada"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Mock dashboard card */}
            <div className="hidden lg:flex items-center justify-center">
              <div className="relative w-full max-w-sm">
                {/* Main card */}
                <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider">Patrimonio neto</p>
                      <p className="text-3xl font-bold text-white mt-1">$4.820.000</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1 text-green-400 text-sm font-medium">
                      +12.4%
                    </div>
                  </div>

                  {/* Score ring mock */}
                  <div className="flex items-center gap-4 mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                    <div className="relative w-16 h-16 shrink-0">
                      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                        <circle cx="32" cy="32" r="26" fill="none" stroke="#1e293b" strokeWidth="6"/>
                        <circle cx="32" cy="32" r="26" fill="none" stroke="#3b82f6" strokeWidth="6"
                          strokeDasharray="163.4" strokeDashoffset="49" strokeLinecap="round"/>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-white">680</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Score crediticio</p>
                      <p className="text-white font-semibold">Muy bueno</p>
                      <p className="text-xs text-slate-500 mt-0.5">0–850</p>
                    </div>
                  </div>

                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Ingresos", val: "$1.250.000", color: "text-green-400" },
                      { label: "Gastos", val: "$890.000", color: "text-red-400" },
                      { label: "Ahorro", val: "28.8%", color: "text-blue-400" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-slate-900/40 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${color}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -top-4 -right-4 bg-blue-600 text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg shadow-blue-600/40">
                  Score dual ✓
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

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 60L480 20C720 0 960 0 1440 20V60H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Funcionalidades</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {t("landing.featuresTitle")}
            </h2>
            <p className="text-lg text-gray-500">{t("landing.featuresSubtitle")}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { icon: BarChart3, title: t("landing.feature1Title"), desc: t("landing.feature1Desc"), color: "blue" },
              { icon: Activity, title: t("landing.feature2Title"), desc: t("landing.feature2Desc"), color: "emerald" },
              { icon: Store, title: t("landing.feature3Title"), desc: t("landing.feature3Desc"), color: "violet" },
              { icon: Target, title: t("landing.feature4Title"), desc: t("landing.feature4Desc"), color: "orange" },
              { icon: Bell, title: t("landing.feature5Title"), desc: t("landing.feature5Desc"), color: "pink" },
              { icon: Lock, title: t("landing.feature6Title"), desc: t("landing.feature6Desc"), color: "slate" },
            ].map(({ icon: Icon, title, desc, color }) => {
              const bg: Record<string, string> = {
                blue: "bg-blue-50 text-blue-600",
                emerald: "bg-emerald-50 text-emerald-600",
                violet: "bg-violet-50 text-violet-600",
                orange: "bg-orange-50 text-orange-600",
                pink: "bg-pink-50 text-pink-600",
                slate: "bg-slate-100 text-slate-600",
              };
              return (
                <div key={title} className="group p-6 rounded-2xl border border-gray-100 hover:border-blue-100 hover:shadow-md hover:-translate-y-0.5 transition-all bg-white">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${bg[color]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SCORE PREVIEW ────────────────────────────────────────────────── */}
      <section className="py-16 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="relative container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div className="space-y-5">
              <p className="text-blue-200 font-semibold text-sm uppercase tracking-widest">Score dual</p>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                Tu salud financiera, medida con dos lentes complementarios
              </h2>
              <p className="text-blue-100 leading-relaxed">
                El <strong>score crediticio tradicional</strong> (0–850) basado en el historial CMF, y el <strong>score transaccional</strong> (0–100) basado en tus comportamientos reales de gasto y ahorro. Juntos dan el panorama completo.
              </p>
              <Link href={ROUTES.infoScoreCredito}>
                <Button className="bg-white text-blue-700 hover:bg-blue-50 font-semibold gap-2 mt-2">
                  Entender mi score <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Score crediticio", value: "720", max: "850", color: "from-emerald-400 to-teal-400", tag: "Muy bueno", pct: 85 },
                { label: "Score transaccional", value: "78", max: "100", color: "from-blue-300 to-indigo-300", tag: "Bueno", pct: 78 },
              ].map(({ label, value, max, color, tag, pct }) => (
                <div key={label} className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-5 text-center">
                  <p className="text-xs text-blue-200 mb-3">{label}</p>
                  <div className="relative w-20 h-20 mx-auto mb-3">
                    <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="7"/>
                      <circle cx="40" cy="40" r="32" fill="none" stroke="url(#grad)" strokeWidth="7"
                        strokeDasharray={`${2 * Math.PI * 32}`}
                        strokeDashoffset={`${2 * Math.PI * 32 * (1 - pct / 100)}`}
                        strokeLinecap="round"/>
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="white" stopOpacity="0.9"/>
                          <stop offset="100%" stopColor="white"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-white">{value}</span>
                      <span className="text-[9px] text-blue-200">/{max}</span>
                    </div>
                  </div>
                  <span className={`inline-block text-xs font-semibold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="como-funciona" className="py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Proceso</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {t("landing.howItWorksTitle")}
            </h2>
            <p className="text-lg text-gray-500">{t("landing.howItWorksSubtitle")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { n: "01", icon: FileText, title: t("landing.step1Title"), desc: t("landing.step1Desc") },
              { n: "02", icon: Zap, title: t("landing.step2Title"), desc: t("landing.step2Desc") },
              { n: "03", icon: TrendingUp, title: t("landing.step3Title"), desc: t("landing.step3Desc") },
            ].map(({ n, icon: Icon, title, desc }, i) => (
              <div key={n} className="relative flex flex-col items-center text-center">
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-0 h-px border-t-2 border-dashed border-blue-200" />
                )}
                <div className="relative mb-6">
                  <span className="absolute -top-3 -right-3 text-6xl font-black text-blue-50 select-none leading-none">{n}</span>
                  <div className="relative w-16 h-16 bg-white rounded-2xl shadow-md border border-gray-100 flex items-center justify-center">
                    <Icon className="h-7 w-7 text-blue-600" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT CATEGORIES ───────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Marketplace</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {t("landing.categoriesTitle")}
            </h2>
            <p className="text-lg text-gray-500">{t("landing.categoriesSubtitle")}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-5xl mx-auto">
            {[
              { icon: Landmark, title: t("landing.catCuentas"), desc: t("landing.catCuentasDesc") },
              { icon: CreditCard, title: t("landing.catTarjetas"), desc: t("landing.catTarjetasDesc") },
              { icon: Banknote, title: t("landing.catCreditos"), desc: t("landing.catCreditosDesc") },
              { icon: Wallet, title: t("landing.catLineas"), desc: t("landing.catLineasDesc") },
              { icon: Home, title: t("landing.catHipotecarios"), desc: t("landing.catHipotecariosDesc") },
              { icon: PiggyBank, title: t("landing.catDepositos"), desc: t("landing.catDepositosDesc") },
              { icon: TrendingUp, title: t("landing.catFondos"), desc: t("landing.catFondosDesc") },
              { icon: Shield, title: t("landing.catSeguros"), desc: t("landing.catSegurosDesc") },
              { icon: Target, title: t("landing.catAPV"), desc: t("landing.catAPVDesc") },
              { icon: ArrowLeftRight, title: t("landing.catPortabilidad"), desc: t("landing.catPortabilidadDesc") },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group flex flex-col items-center text-center p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm transition-all cursor-default">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-gray-800 leading-tight">{title}</p>
                <p className="text-[11px] text-gray-400 mt-1 hidden sm:block">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY CODA ─────────────────────────────────────────────────────── */}
      <section className="py-24 bg-[#0a0f1e] text-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <p className="text-blue-400 font-semibold text-sm uppercase tracking-widest mb-3">Diferencial</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              {t("landing.whyChooseTitle")}
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Creamos CODA porque los chilenos merecen entender y optimizar sus finanzas con las mismas herramientas que usan los expertos.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {[
              { icon: DollarSign, title: t("landing.whyFreeTitle"), desc: t("landing.whyFreeDesc"), accent: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
              { icon: BarChart3, title: t("landing.whyRealDataTitle"), desc: t("landing.whyRealDataDesc"), accent: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
              { icon: Shield, title: t("landing.whyNeutralTitle"), desc: t("landing.whyNeutralDesc"), accent: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20" },
              { icon: Landmark, title: t("landing.whyRegulatedTitle"), desc: t("landing.whyRegulatedDesc"), accent: "text-indigo-400", bg: "bg-indigo-400/10 border-indigo-400/20" },
            ].map(({ icon: Icon, title, desc, accent, bg }) => (
              <div key={title} className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-colors flex gap-5">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className={`h-5 w-5 ${accent}`} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Team/mission note */}
          <div className="mt-14 text-center max-w-xl mx-auto">
            <p className="text-slate-500 text-sm leading-relaxed">
              Desarrollado por un equipo de ingenieros, economistas y diseñadores chilenos apasionados por democratizar las finanzas personales en Latinoamérica.
            </p>
            <div className="flex items-center justify-center gap-6 mt-6">
              {["Sin comisiones ocultas", "Sin venta de datos", "Privacidad garantizada"].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Preguntas frecuentes
            </h2>
          </div>

          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {[
                {
                  q: "¿CODA es gratis de verdad?",
                  a: "Sí, para personas naturales en Chile es 100% gratuito y sin tarjeta de crédito. Para instituciones financieras ofrecemos planes B2B.",
                },
                {
                  q: "¿Qué hacen con mis datos?",
                  a: "Tus datos viven encriptados en nuestra infraestructura. Nunca los vendemos ni compartimos sin tu consentimiento explícito, en cumplimiento con la Ley 19.628 y la Ley Fintec 21.521.",
                },
                {
                  q: "¿Necesito dar mi RUT para probar CODA?",
                  a: "No. Puedes registrarte solo con correo electrónico. El RUT se solicita cuando calculamos tu score crediticio real con datos CMF.",
                },
                {
                  q: "¿Cómo obtengo mi cartola bancaria para subirla?",
                  a: "La descargas desde tu banco en formato PDF. CODA soporta los principales bancos chilenos (Santander, BCI, Banco de Chile, Estado, Itaú, Scotiabank, Security, BICE) y añadimos nuevos formatos regularmente.",
                },
                {
                  q: "¿Están regulados por la CMF?",
                  a: "CODA opera bajo el marco de la Ley 21.521 (Ley Fintec). Nuestra inscripción en el Registro de Prestadores de Servicios Financieros (RPSF) está en trámite ante la CMF.",
                },
                {
                  q: "¿Puedo borrar mi cuenta y mis datos?",
                  a: "Sí. Desde Configuración puedes eliminar tu cuenta en cualquier momento. Cumplimos con el derecho al olvido bajo la Ley 19.628.",
                },
              ].map(({ q, a }, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-white rounded-xl border border-gray-100 px-6 data-[state=open]:shadow-sm transition-shadow"
                >
                  <AccordionTrigger className="text-left text-gray-900 font-semibold text-sm md:text-base hover:no-underline">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-500 leading-relaxed">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ── Score Express ────────────────────────────────────────────────── */}
      <ScoreExpressWidget />

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            {t("landing.ctaTitle")}
          </h2>
          <p className="text-xl text-blue-100 mb-10 leading-relaxed">
            {t("landing.ctaSubtitle")}
          </p>
          <Link href={ROUTES.registro}>
            <Button
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-10 h-14 text-lg shadow-xl shadow-blue-900/30 transition-all"
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
