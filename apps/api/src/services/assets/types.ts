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

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  property: 'Propiedad',
  vehicle: 'Vehículo',
  crypto: 'Criptoactivo',
  investment: 'Inversión',
  other: 'Otro',
};
