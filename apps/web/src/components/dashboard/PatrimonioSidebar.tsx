import { Landmark, CreditCard, TrendingUp } from "lucide-react";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

interface PatrimonioSidebarProps {
  inversionesLiquidas: number;
  cuentasVista: number;
  totalPatrimonioNeto: number;
}

export default function PatrimonioSidebar({
  inversionesLiquidas,
  cuentasVista,
  totalPatrimonioNeto,
}: PatrimonioSidebarProps) {
  const items = [
    {
      icon: TrendingUp,
      label: "Inversiones líquidas",
      value: inversionesLiquidas,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-500/10",
    },
    {
      icon: CreditCard,
      label: "Cuentas vista",
      value: cuentasVista,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-500/10",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Patrimonio
        </p>
      </div>

      <p className="text-3xl font-bold tabular-nums text-foreground">
        {fmtCLP(totalPatrimonioNeto)}
      </p>
      <p className="text-xs text-muted-foreground -mt-2">Patrimonio neto</p>

      <div className="space-y-3 pt-1">
        {items.map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{fmtCLP(value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
