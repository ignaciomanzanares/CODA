import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, HeartPulse, Info } from "lucide-react";
import AssetList from "@/components/assets/AssetList";
import AssetForm from "@/components/assets/AssetForm";

type AssetType = 'property' | 'vehicle' | 'crypto' | 'investment' | 'other';

interface UserAsset {
  id: string;
  type: AssetType;
  name: string;
  acquisitionCostClp: number;
  estimatedValueClp: number | null;
  hasLien: boolean;
  lienAmountClp: number | null;
  currency: string;
  notes: string | null;
  createdAt: string;
}

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

function clpFormat(n: number): string {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

export default function MisActivos() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const { apiRequest } = useApi();

  const { data: assets = [], isLoading } = useQuery<UserAsset[]>({
    queryKey: ['assets'],
    queryFn: () => apiRequest<UserAsset[]>('GET', '/api/assets'),
  });

  const createMutation = useMutation({
    mutationFn: (data: AssetFormData) =>
      apiRequest('POST', '/api/assets', data),
    onSuccess: () => {
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  const totalDeclarado = assets.reduce(
    (sum, a) => sum + (a.estimatedValueClp ?? a.acquisitionCostClp),
    0,
  );

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis activos</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" />
          Agregar activo
        </Button>
      </div>

      {/* Banner informativo cuando no hay activos */}
      {!isLoading && assets.length === 0 && (
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Agrega tus propiedades, vehículos u otros activos para que tu diagnóstico
              financiero sea más preciso. Los activos declarados se usan para calcular
              el ratio <strong>deuda/activos</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resumen */}
      {assets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total activos declarados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{clpFormat(totalDeclarado)}</div>
            <p className="text-xs text-gray-500 mt-1">
              {assets.length} activo{assets.length !== 1 ? 's' : ''} registrado{assets.length !== 1 ? 's' : ''}.
              Los saldos de tus cuentas bancarias se suman automáticamente desde tu cartola.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <AssetList assets={assets} />
      )}

      {/* CTA hacia salud financiera */}
      <div className="border-t pt-4">
        <Link href={ROUTES.saludFinanciera}>
          <Button variant="outline" className="gap-2 w-full">
            <HeartPulse className="w-4 h-4" />
            Ver mi diagnóstico de salud financiera
          </Button>
        </Link>
      </div>

      {/* Modal agregar activo */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar activo</DialogTitle>
          </DialogHeader>
          <AssetForm
            isLoading={createMutation.isPending}
            onSubmit={async (data) => { await createMutation.mutateAsync(data); }}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
