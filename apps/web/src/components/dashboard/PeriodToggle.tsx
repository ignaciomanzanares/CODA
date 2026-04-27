import { cn } from "@/lib/utils";
import type { DashboardPeriod } from "@/types/dashboard";

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

interface PeriodToggleProps {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}

export default function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-muted/60 p-1">
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
            key === value
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
