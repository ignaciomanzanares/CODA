import { cn } from "@/lib/utils";

const colorMap = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border-blue-100 dark:border-blue-500/20",
  green:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20",
  purple:
    "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400 border-violet-100 dark:border-violet-500/20",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400 border-pink-100 dark:border-pink-500/20",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 border-red-100 dark:border-red-500/20",
  slate:
    "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400 border-slate-200 dark:border-slate-500/20",
  orange:
    "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 border-orange-100 dark:border-orange-500/20",
  indigo:
    "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20",
} as const;

type PastelColor = keyof typeof colorMap;

interface PastelIconProps {
  icon: React.ElementType;
  color?: PastelColor;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { box: "w-8 h-8 rounded-lg", icon: "h-4 w-4" },
  md: { box: "w-11 h-11 rounded-xl", icon: "h-5 w-5" },
  lg: { box: "w-14 h-14 rounded-2xl", icon: "h-7 w-7" },
};

export function PastelIcon({
  icon: Icon,
  color = "blue",
  size = "md",
  className,
}: PastelIconProps) {
  const s = sizes[size];
  return (
    <div
      className={cn(
        s.box,
        "border flex items-center justify-center shrink-0",
        colorMap[color],
        className,
      )}
    >
      <Icon className={s.icon} />
    </div>
  );
}
