import { Link } from "wouter";
import { Landmark, CreditCard, TrendingUp, Building2, ChevronRight, Plus } from "lucide-react";
import { ROUTES } from "@/lib/routes";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

interface PatrimonioSidebarProps {
  inversionesLiquidas: number;
  cuentasVista: number;
  activosDeclarados: number;
  totalPatrimonioNeto: number;
}

/**
 * Patrimonio neto = saldos bancarios (cuentas + inversiones) − deudas + activos
 * declarados (propiedad, vehículo, etc.). Los activos declarados son una línea
 * más y ya están sumados al neto (ver routes-financial-summary). La línea linkea
 * a /mis-activos para ver/agregar; si no hay activos, invita a declarar el primero.
 */
export default function PatrimonioSidebar({
  inversionesLiquidas,
  cuentasVista,
  activosDeclarados,
  totalPatrimonioNeto,
}: PatrimonioSidebarProps) {
  const bankItems = [
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
        {bankItems.map(({ icon: Icon, label, value, color, bg }) => (
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

        {/* Activos declarados — parte del neto; clickable para ver/agregar en /mis-activos */}
        <Link
          href={ROUTES.misActivos}
          className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
            <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Activos declarados</p>
            {activosDeclarados > 0 ? (
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {fmtCLP(activosDeclarados)}
              </p>
            ) : (
              <p className="inline-flex items-center gap-0.5 text-sm font-medium text-primary">
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
