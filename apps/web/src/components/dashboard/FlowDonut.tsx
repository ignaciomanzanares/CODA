import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { FlowSegment } from "@/types/dashboard";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

interface FlowDonutProps {
  segments: FlowSegment[];
  pctIncomeSpent: number | null; // 0-100 en el centro; null = ingreso no medible (solo TC)
  totalExpenses: number;
}

export default function FlowDonut({ segments, pctIncomeSpent, totalExpenses }: FlowDonutProps) {
  if (segments.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Distribución de gastos
      </p>

      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative w-40 h-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                strokeWidth={0}
              >
                {segments.map((seg) => (
                  <Cell key={seg.key} fill={seg.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {pctIncomeSpent != null ? `${pctIncomeSpent}%` : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight text-center">
              {pctIncomeSpent != null ? "del ingreso" : "sin ingreso registrado"}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 min-w-0">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{seg.label}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {fmtCLP(seg.value)}
                </p>
              </div>
            </div>
          ))}
          <div className="border-t border-border pt-2 mt-1">
            <p className="text-xs text-muted-foreground">
              Total:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {fmtCLP(totalExpenses)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
