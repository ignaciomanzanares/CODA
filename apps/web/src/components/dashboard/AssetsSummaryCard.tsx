import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Landmark, Home, Car, Coins, TrendingUp, Package, Plus, ChevronRight } from "lucide-react";
import { useApi } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { Skeleton } from "@/components/ui/skeleton";

type AssetType = "property" | "vehicle" | "crypto" | "investment" | "other";

interface UserAsset {
  id: string;
  type: AssetType;
  name: string;
  acquisitionCostClp: number;
  estimatedValueClp: number | null;
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

const TYPE_META: Record<AssetType, { icon: React.ElementType; label: string }> = {
  property: { icon: Home, label: "Propiedad" },
  vehicle: { icon: Car, label: "Vehículo" },
  crypto: { icon: Coins, label: "Cripto" },
  investment: { icon: TrendingUp, label: "Inversión" },
  other: { icon: Package, label: "Otro" },
};

function Chrome({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-4">{children}</div>;
}

function CardHeader() {
  return (
    <div className="flex items-center gap-2">
      <Landmark className="h-4 w-4 text-muted-foreground" />
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Mis activos
      </p>
    </div>
  );
}

/**
 * Resumen de activos declarados en el panel. Antes solo se veía en /mis-activos
 * (escondido en el menú del avatar); acá se surface el total y los principales,
 * con acceso directo a agregar/editar. Los activos alimentan el ratio
 * deuda/activos de la salud financiera.
 */
export default function AssetsSummaryCard() {
  const { apiRequest } = useApi();
  const {
    data: assets = [],
    isLoading,
    isError,
  } = useQuery<UserAsset[]>({
    queryKey: ["assets"],
    queryFn: () => apiRequest<UserAsset[]>("GET", "/api/assets"),
    staleTime: 60_000,
    retry: 1,
  });

  // El panel no debe romperse si /api/assets falla.
  if (isError) return null;

  if (isLoading) {
    return <Skeleton className="h-[132px] rounded-2xl" />;
  }

  const total = assets.reduce((sum, a) => sum + (a.estimatedValueClp ?? a.acquisitionCostClp), 0);

  // Estado vacío: prompt para declarar el primer activo.
  if (assets.length === 0) {
    return (
      <Chrome>
        <CardHeader />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Declara tus propiedades, vehículos o inversiones para afinar tu diagnóstico — se usan en
          el ratio <strong className="font-semibold text-foreground">deuda/activos</strong>.
        </p>
        <Link
          href={ROUTES.misActivos}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar activo
        </Link>
      </Chrome>
    );
  }

  const top = [...assets]
    .sort(
      (a, b) =>
        (b.estimatedValueClp ?? b.acquisitionCostClp) -
        (a.estimatedValueClp ?? a.acquisitionCostClp),
    )
    .slice(0, 3);

  return (
    <Chrome>
      <div className="flex items-start justify-between gap-3">
        <CardHeader />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {assets.length} activo{assets.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div>
        <p className="text-3xl font-bold tabular-nums text-foreground">{fmtCLP(total)}</p>
        <p className="-mt-0.5 text-xs text-muted-foreground">Total declarado</p>
      </div>

      <div className="space-y-2.5 pt-1">
        {top.map((a) => {
          const { icon: Icon, label } = TYPE_META[a.type] ?? TYPE_META.other;
          return (
            <div key={a.id} className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">
                {fmtCLP(a.estimatedValueClp ?? a.acquisitionCostClp)}
              </p>
            </div>
          );
        })}
      </div>

      <Link
        href={ROUTES.misActivos}
        className="inline-flex items-center gap-0.5 pt-1 text-xs font-medium text-primary"
      >
        {assets.length > top.length ? "Ver todos y agregar" : "Ver y agregar activos"}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </Chrome>
  );
}
