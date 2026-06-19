export type AssetType = 'property' | 'vehicle' | 'crypto' | 'investment' | 'other';

export interface UserAsset {
  id: string;
  userId: string;
  type: AssetType;
  name: string;
  acquisitionCostClp: number;
  estimatedValueClp: number | null;
  hasLien: boolean;
  lienAmountClp: number | null;
  currency: string;
  documentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Valor efectivo del activo para el ratio: estimatedValue ?? acquisitionCost */
export function effectiveAssetValueClp(asset: UserAsset): number {
  return asset.estimatedValueClp ?? asset.acquisitionCostClp;
}

/** Descripción normalizada para comparar activos: trim + minúsculas + espacios colapsados. */
export function normalizeAssetDescription(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Firma de identidad de un activo: dos activos con la misma firma son el MISMO
 * activo (duplicado). Conservadora a propósito — sólo coincidencias EXACTAS de
 * (userId, type, descripción normalizada, costo de adquisición, garantía) — para
 * que activos legítimamente parecidos (otro monto/garantía/descripción) NO se
 * traten como duplicados. La consume el guard idempotente del create y el script
 * de dedup, de modo que ambos definen "idéntico" igual.
 */
export function assetSignature(a: {
  userId: string;
  type: string;
  name: string;
  acquisitionCostClp: number | null | undefined;
  lienAmountClp?: number | null;
}): string {
  return [
    a.userId,
    a.type,
    normalizeAssetDescription(a.name),
    a.acquisitionCostClp ?? 0,
    a.lienAmountClp ?? 0,
  ].join('|');
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  property: 'Propiedad',
  vehicle: 'Vehículo',
  crypto: 'Criptoactivo',
  investment: 'Inversión',
  other: 'Otro',
};
