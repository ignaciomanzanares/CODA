import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { PastelIcon } from "./pastel-icon";

type PastelColor = "blue" | "green" | "purple" | "pink" | "red" | "slate" | "orange" | "indigo";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
  subtitle?: string;
  icon?: React.ElementType;
  iconColor?: PastelColor;
  chip?: string;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  delta,
  deltaDirection = "neutral",
  subtitle,
  icon,
  iconColor = "blue",
  chip,
  className,
  onClick,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-card p-5 transition-all",
        "hover:border-primary/30 hover:shadow-md hover:shadow-primary/5",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {chip && (
        <span className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full px-2.5 py-0.5 shadow-sm">
          {chip}
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
          {delta && (
            <div
              className={cn(
                "flex items-center gap-1 mt-1 text-xs font-medium",
                deltaDirection === "up" && "text-emerald-600 dark:text-emerald-400",
                deltaDirection === "down" && "text-red-600 dark:text-red-400",
                deltaDirection === "neutral" && "text-muted-foreground",
              )}
            >
              {deltaDirection === "up" && <TrendingUp className="h-3 w-3" />}
              {deltaDirection === "down" && <TrendingDown className="h-3 w-3" />}
              {delta}
            </div>
          )}
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {icon && <PastelIcon icon={icon} color={iconColor} size="sm" />}
      </div>
    </div>
  );
}
