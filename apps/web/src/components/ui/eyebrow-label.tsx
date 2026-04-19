import { cn } from "@/lib/utils";

interface EyebrowLabelProps {
  children: React.ReactNode;
  color?: "blue" | "green" | "purple" | "orange" | "muted";
  className?: string;
}

const colors = {
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-emerald-600 dark:text-emerald-400",
  purple: "text-violet-600 dark:text-violet-400",
  orange: "text-orange-600 dark:text-orange-400",
  muted: "text-muted-foreground",
};

export function EyebrowLabel({ children, color = "blue", className }: EyebrowLabelProps) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest", colors[color], className)}>
      {children}
    </p>
  );
}
