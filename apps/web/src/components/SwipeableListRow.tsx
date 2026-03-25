import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";

const SWIPE_THRESHOLD = 80;
const MAX_OFFSET = 120;

type SwipeableListRowProps = {
  children: ReactNode;
  onDelete?: () => void;
  onEdit?: () => void;
  canDelete?: boolean;
  canEdit?: boolean;
  className?: string;
};

/**
 * Deslizar izquierda → Eliminar; deslizar derecha → Editar (patrón CODA / BillSplit).
 */
export default function SwipeableListRow({
  children,
  onDelete,
  onEdit,
  canDelete = true,
  canEdit = true,
  className,
}: SwipeableListRowProps) {
  const [offset, setOffset] = useState(0);
  const touchStart = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const x = e.touches[0].clientX;
    const dx = x - touchStart.current;
    if (dx < 0 && canDelete) {
      setOffset(Math.max(dx, -MAX_OFFSET));
    } else if (dx > 0 && canEdit) {
      setOffset(Math.min(dx, MAX_OFFSET));
    } else {
      setOffset(0);
    }
  };

  const handleTouchEnd = () => {
    if (offset <= -SWIPE_THRESHOLD && canDelete && onDelete) {
      hapticLight();
      onDelete();
    } else if (offset >= SWIPE_THRESHOLD && canEdit && onEdit) {
      hapticLight();
      onEdit();
    }
    touchStart.current = null;
    setOffset(0);
  };

  const showDelete = offset < 0 && canDelete;
  const showEdit = offset > 0 && canEdit;

  if (!canDelete && !canEdit) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      {showEdit && (
        <div
          className="absolute inset-y-0 left-0 z-0 flex items-center justify-center bg-primary text-primary-foreground text-sm font-medium"
          style={{ width: offset }}
        >
          Editar
        </div>
      )}
      {showDelete && (
        <div
          className="absolute inset-y-0 right-0 z-0 flex items-center justify-center bg-destructive text-destructive-foreground text-sm font-medium"
          style={{ width: -offset }}
        >
          Eliminar
        </div>
      )}
      <div
        className="relative z-10 transition-transform duration-150 touch-pan-y"
        style={{ transform: offset !== 0 ? `translateX(${-offset}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
