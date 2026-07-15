import { useEffect, useRef, useState } from "react";

/**
 * Interactive −2 → +5 financial-health scale.
 * CODA's signature diagnostic: honest, deterministic, ownable.
 * Auto-cycles through the levels; pauses on hover / focus / touch.
 */

type Tone = "red" | "orange" | "amber" | "lime" | "green" | "emerald";

interface Level {
  value: number;
  title: string;
  desc: string;
  action: string;
  tone: Tone;
}

// Ordered top (+5) to bottom (−2): the "climb" to financial health.
const LEVELS: Level[] = [
  {
    value: 5,
    title: "Independencia financiera",
    desc: "Tu patrimonio genera flujo pasivo",
    action: "Gestión patrimonial",
    tone: "emerald",
  },
  {
    value: 4,
    title: "Inversión diversificada",
    desc: "Portafolio activo multi-clase",
    action: "Cartera diversificada",
    tone: "emerald",
  },
  {
    value: 3,
    title: "Inversión inicial",
    desc: "Excedente invertido en bajo riesgo",
    action: "Fondos mutuos / ETF",
    tone: "green",
  },
  {
    value: 2,
    title: "Fondo consolidado",
    desc: "6 meses ahorrados, flujo estable",
    action: "Depósito a plazo",
    tone: "green",
  },
  {
    value: 1,
    title: "Fondo básico",
    desc: "3 meses de gastos esenciales",
    action: "Cuenta de ahorro",
    tone: "lime",
  },
  {
    value: 0,
    title: "Al día, sin excedente",
    desc: "Obligaciones corrientes, sin ahorro",
    action: "Refinanciamiento preventivo",
    tone: "amber",
  },
  {
    value: -1,
    title: "Sobreendeudado",
    desc: "Cuotas > 50% del ingreso mensual",
    action: "Reestructuración",
    tone: "orange",
  },
  {
    value: -2,
    title: "Insolvencia activa",
    desc: "Mora vigente, deuda > patrimonio",
    action: "Orientación concursal",
    tone: "red",
  },
];

// Full literal class strings so Tailwind's JIT scanner keeps them.
const TONE: Record<
  Tone,
  { dot: string; text: string; tint: string; border: string; chip: string; glow: string }
> = {
  red: {
    dot: "bg-red-500",
    text: "text-red-300",
    tint: "bg-red-500/10",
    border: "border-red-500/40",
    chip: "bg-red-500/15 text-red-300",
    glow: "shadow-red-500/30",
  },
  orange: {
    dot: "bg-orange-500",
    text: "text-orange-300",
    tint: "bg-orange-500/10",
    border: "border-orange-500/40",
    chip: "bg-orange-500/15 text-orange-300",
    glow: "shadow-orange-500/30",
  },
  amber: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    tint: "bg-amber-400/10",
    border: "border-amber-400/40",
    chip: "bg-amber-400/15 text-amber-300",
    glow: "shadow-amber-400/30",
  },
  lime: {
    dot: "bg-lime-400",
    text: "text-lime-300",
    tint: "bg-lime-400/10",
    border: "border-lime-400/40",
    chip: "bg-lime-400/15 text-lime-300",
    glow: "shadow-lime-400/30",
  },
  green: {
    dot: "bg-green-500",
    text: "text-green-300",
    tint: "bg-green-500/10",
    border: "border-green-500/40",
    chip: "bg-green-500/15 text-green-300",
    glow: "shadow-green-500/30",
  },
  emerald: {
    dot: "bg-emerald-500",
    text: "text-emerald-300",
    tint: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    chip: "bg-emerald-500/15 text-emerald-300",
    glow: "shadow-emerald-500/30",
  },
};

export default function HealthScaleHero() {
  const [active, setActive] = useState(2); // start at +3 (index 2)
  const [paused, setPaused] = useState(false);
  const prefersReduced = useRef(false);

  useEffect(() => {
    prefersReduced.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || prefersReduced.current) return;
    const id = setInterval(() => setActive((i) => (i + 1) % LEVELS.length), 2400);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div
      className="relative w-full max-w-md mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-xl p-5 sm:p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Diagnóstico CODA
            </p>
            <p className="text-sm text-slate-300 mt-0.5">Tu salud financiera, sin rodeos</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Escala</p>
            <p className="text-sm font-semibold text-slate-200 tabular-nums">−2 → +5</p>
          </div>
        </div>

        {/* Scale rows */}
        <div className="space-y-1.5">
          {LEVELS.map((lvl, i) => {
            const isActive = i === active;
            const t = TONE[lvl.tone];
            const sign = lvl.value > 0 ? `+${lvl.value}` : `${lvl.value}`;
            return (
              <button
                key={lvl.value}
                type="button"
                aria-pressed={isActive}
                aria-label={`Nivel ${sign}: ${lvl.title}`}
                onClick={() => setActive(i)}
                className={[
                  "w-full text-left rounded-xl border transition-all duration-300 flex items-center gap-3 px-3",
                  isActive
                    ? `${t.tint} ${t.border} py-3 shadow-lg ${t.glow}`
                    : "border-transparent hover:bg-white/5 py-2",
                ].join(" ")}
              >
                {/* Value badge */}
                <span
                  className={[
                    "shrink-0 grid place-items-center rounded-lg font-bold tabular-nums transition-all duration-300",
                    isActive
                      ? `${t.dot} text-slate-950 w-9 h-9 text-base`
                      : "bg-white/5 text-slate-400 w-7 h-7 text-xs",
                  ].join(" ")}
                >
                  {sign}
                </span>

                {/* Title + (active) detail */}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-semibold leading-tight ${isActive ? "text-white" : "text-slate-400"} ${isActive ? "text-[15px]" : "text-sm"}`}
                  >
                    {lvl.title}
                  </span>
                  {isActive && (
                    <span className="block text-xs text-slate-400 mt-0.5">{lvl.desc}</span>
                  )}
                </span>

                {/* Action chip (active only) */}
                {isActive && (
                  <span
                    className={`shrink-0 hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${t.chip}`}
                  >
                    {lvl.action}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-5 text-[11px] leading-relaxed text-slate-500 border-t border-white/5 pt-4">
          Si estás sobreendeudado,{" "}
          <span className="text-slate-300">no te ofrecemos más crédito</span> — te orientamos a
          salir. Regla anti-predatoria, escrita en código.
        </p>
      </div>

      {/* Ambient glow behind the card */}
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-500/10 via-transparent to-orange-500/10 blur-2xl pointer-events-none" />
    </div>
  );
}
