import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type AssetType = 'property' | 'vehicle' | 'crypto' | 'investment' | 'other';

interface AssetFormData {
  type: AssetType;
  name: string;
  acquisitionCostClp: number;
  estimatedValueClp: number | null;
  hasLien: boolean;
  lienAmountClp: number | null;
  currency: string;
  notes: string | null;
}

interface AssetFormProps {
  initialData?: Partial<AssetFormData>;
  onSubmit: (data: AssetFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'property',   label: 'Propiedad (departamento, casa, terreno)' },
  { value: 'vehicle',    label: 'Vehículo (auto, moto, camión)' },
  { value: 'crypto',     label: 'Criptoactivo (Bitcoin, ETH, etc.)' },
  { value: 'investment', label: 'Inversión (acciones, fondos, bonos)' },
  { value: 'other',      label: 'Otro activo' },
];

function parseMonto(raw: string): number | null {
  const n = parseInt(raw.replace(/\D/g, ''), 10);
  return isNaN(n) ? null : n;
}

function formatMonto(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('es-CL');
}

export default function AssetForm({ initialData, onSubmit, onCancel, isLoading }: AssetFormProps) {
  const [type, setType] = useState<AssetType>(initialData?.type ?? 'property');
  const [name, setName] = useState(initialData?.name ?? '');
  const [acquisitionRaw, setAcquisitionRaw] = useState(formatMonto(initialData?.acquisitionCostClp ?? null));
  const [estimatedRaw, setEstimatedRaw] = useState(formatMonto(initialData?.estimatedValueClp ?? null));
  const [hasLien, setHasLien] = useState(initialData?.hasLien ?? false);
  const [lienRaw, setLienRaw] = useState(formatMonto(initialData?.lienAmountClp ?? null));
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const acquisitionCostClp = parseMonto(acquisitionRaw);
    if (!acquisitionCostClp || acquisitionCostClp <= 0) {
      setError('Ingresa un costo de adquisición válido.');
      return;
    }
    if (!name.trim()) {
      setError('Ingresa un nombre para el activo.');
      return;
    }

    try {
      await onSubmit({
        type,
        name: name.trim(),
        acquisitionCostClp,
        estimatedValueClp: parseMonto(estimatedRaw),
        hasLien,
        lienAmountClp: hasLien ? parseMonto(lienRaw) : null,
        currency: 'CLP',
        notes: notes.trim() || null,
      });
    } catch {
      setError('Error al guardar el activo. Inténtalo de nuevo.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Tipo de activo</Label>
        <Select value={type} onValueChange={(v) => setType(v as AssetType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSET_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Descripción</Label>
        <Input
          id="name"
          placeholder="Ej: Departamento Las Condes, 3D/2B"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="acquisition">Costo de adquisición (CLP)</Label>
        <Input
          id="acquisition"
          inputMode="numeric"
          placeholder="Ej: 120.000.000"
          value={acquisitionRaw}
          onChange={(e) => setAcquisitionRaw(e.target.value)}
          required
        />
        <p className="text-xs text-gray-500">Precio de compra original o valor de libros.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="estimated">Valor estimado actual (CLP) — opcional</Label>
        <Input
          id="estimated"
          inputMode="numeric"
          placeholder="Ej: 150.000.000"
          value={estimatedRaw}
          onChange={(e) => setEstimatedRaw(e.target.value)}
        />
        <p className="text-xs text-gray-500">Si no lo ingresas, se usa el costo de adquisición.</p>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="lien" checked={hasLien} onCheckedChange={setHasLien} />
        <Label htmlFor="lien">Este activo tiene una garantía asociada (hipoteca, prenda)</Label>
      </div>

      {hasLien && (
        <div className="space-y-1.5 pl-4 border-l-2 border-orange-200">
          <Label htmlFor="lienAmount">Monto de la garantía (CLP)</Label>
          <Input
            id="lienAmount"
            inputMode="numeric"
            placeholder="Ej: 80.000.000"
            value={lienRaw}
            onChange={(e) => setLienRaw(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          placeholder="Información adicional relevante..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? 'Guardando...' : 'Guardar activo'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
