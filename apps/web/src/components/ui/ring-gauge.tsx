import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface RingGaugeProps {
  value: number;
  max: number;
  label?: string;
  sublabel?: string;
  tone?: "blue" | "green" | "purple" | "orange";
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

const toneColors = {
  blue: { stroke: "#3b82f6", track: "rgba(59,130,246,0.15)" },
  green: { stroke: "#10b981", track: "rgba(16,185,129,0.15)" },
  purple: { stroke: "#8b5cf6", track: "rgba(139,92,246,0.15)" },
  orange: { stroke: "#f59e0b", track: "rgba(245,158,11,0.15)" },
};

const sizeConfig = {
  sm: { dim: 56, sw: 5, r: 22, textClass: "text-sm", subClass: "text-[8px]" },
  md: { dim: 80, sw: 7, r: 32, textClass: "text-xl", subClass: "text-[9px]" },
  lg: { dim: 100, sw: 8, r: 40, textClass: "text-2xl", subClass: "text-[10px]" },
};

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function RingGauge({
  value,
  max,
  label,
  sublabel,
  tone = "blue",
  size = "md",
  className,
  animate = true,
}: RingGaugeProps) {
  const pct = Math.min(value / max, 1);
  const { dim, sw, r, textClass, subClass } = sizeConfig[size];
  const circumference = 2 * Math.PI * r;
  const center = dim / 2;
  const colors = toneColors[tone];

  const [displayPct, setDisplayPct] = useState(animate ? 0 : pct);
  const [displayVal, setDisplayVal] = useState(animate ? 0 : value);
  const ref = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    if (!animate || animatedRef.current) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || animatedRef.current) return;
        animatedRef.current = true;
        observer.disconnect();

        const start = performance.now();
        const duration = 1200;
        function tick(now: number) {
          const t = Math.min((now - start) / duration, 1);
          const eased = easeOutCubic(t);
          setDisplayPct(pct * eased);
          setDisplayVal(Math.round(value * eased));
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animate, pct, value]);

  const offset = circumference * (1 - displayPct);

  return (
    <div ref={ref} className={cn("relative inline-flex flex-col items-center", className)}>
      <svg viewBox={`0 0 ${dim} ${dim}`} width={dim} height={dim} className="-rotate-90">
        <circle cx={center} cy={center} r={r} fill="none" stroke={colors.track} strokeWidth={sw} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={sw}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(textClass, "font-bold text-foreground")}>{displayVal}</span>
        {sublabel && <span className={cn(subClass, "text-muted-foreground")}>{sublabel}</span>}
      </div>
      {label && <p className="text-xs text-muted-foreground mt-1.5">{label}</p>}
    </div>
  );
}
