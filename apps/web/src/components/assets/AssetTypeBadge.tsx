import { Badge } from "@/components/ui/badge";
import { Home, Car, Bitcoin, TrendingUp, Package } from "lucide-react";

type AssetType = "property" | "vehicle" | "crypto" | "investment" | "other";

const ASSET_CONFIG: Record<
  AssetType,
  { label: string; icon: React.ElementType; className: string }
> = {
  property: {
    label: "Propiedad",
    icon: Home,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  },
  vehicle: {
    label: "Vehículo",
    icon: Car,
    className: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  },
  crypto: {
    label: "Criptoactivo",
    icon: Bitcoin,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  },
  investment: {
    label: "Inversión",
    icon: TrendingUp,
    className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  },
  other: {
    label: "Otro",
    icon: Package,
    className: "bg-gray-100 text-gray-800 dark:bg-muted dark:text-muted-foreground",
  },
};

interface AssetTypeBadgeProps {
  type: AssetType;
}

export default function AssetTypeBadge({ type }: AssetTypeBadgeProps) {
  const config = ASSET_CONFIG[type];
  const Icon = config.icon;
  return (
    <Badge className={config.className}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}
