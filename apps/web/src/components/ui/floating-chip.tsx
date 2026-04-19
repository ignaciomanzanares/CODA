import { cn } from "@/lib/utils";

interface FloatingChipProps {
  children: React.ReactNode;
  className?: string;
}

export function FloatingChip({ children, className }: FloatingChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        "bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}
