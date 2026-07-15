import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";
import AssetTypeBadge from "./AssetTypeBadge";
import AssetForm from "./AssetForm";

type AssetType = "property" | "vehicle" | "crypto" | "investment" | "other";

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

interface AssetListProps {
  assets: UserAsset[];
}

function clpFormat(n: number): string {
  return n.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export default function AssetList({ assets }: AssetListProps) {
  const queryClient = useQueryClient();
  const { apiRequest } = useApi();
  const [editingAsset, setEditingAsset] = useState<UserAsset | null>(null);

  // Editar/eliminar requieren sesión: apiRequest envía la cookie personal.
  // apiFetch es para rutas sin sesión y devolvía 401 aquí ("no se puede editar").
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      apiRequest("PUT", `/api/assets/${id}`, data),
    onSuccess: () => {
      setEditingAsset(null);
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  if (assets.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">No tienes activos registrados aún.</p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {assets.map((asset) => {
          const valor = asset.estimatedValueClp ?? asset.acquisitionCostClp;
          return (
            <Card key={asset.id} className="border border-gray-100">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AssetTypeBadge type={asset.type} />
                      {asset.hasLien && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                          Con garantía
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-sm text-gray-900 truncate">{asset.name}</div>
                    <div className="text-sm text-gray-600">{clpFormat(valor)}</div>
                    {asset.estimatedValueClp != null &&
                      asset.estimatedValueClp !== asset.acquisitionCostClp && (
                        <div className="text-xs text-gray-400">
                          Adquisición: {clpFormat(asset.acquisitionCostClp)}
                        </div>
                      )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditingAsset(asset)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                      onClick={() => deleteMutation.mutate(asset.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editingAsset} onOpenChange={(open) => !open && setEditingAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar activo</DialogTitle>
          </DialogHeader>
          {editingAsset && (
            <AssetForm
              initialData={editingAsset}
              isLoading={updateMutation.isPending}
              onSubmit={async (data) => {
                await updateMutation.mutateAsync({ id: editingAsset.id, data });
              }}
              onCancel={() => setEditingAsset(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
