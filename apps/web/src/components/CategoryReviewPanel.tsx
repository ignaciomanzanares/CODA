/**
 * Revisión masiva de categorías: los pendientes agrupados por comercio, cada
 * grupo se corrige con un solo gesto (selector + confirmar). Cada corrección
 * marca las filas como manuales Y le enseña al clasificador incremental — el
 * uso entrena al modelo.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_TAXONOMY, categoryLabel } from "@/lib/categoryTaxonomy";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListChecks, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";

const ALL_CATEGORIES = CATEGORY_TAXONOMY.flatMap((g) => g.parserCategories);

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

interface ReviewGroup {
  merchant: string;
  sample: string;
  count: number;
  total: number;
  currentCategory: string;
  txIds: number[];
}

function GroupRow({ group }: { group: ReviewGroup }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>("");
  const [done, setDone] = useState(false);

  const aplicar = useMutation({
    mutationFn: () =>
      apiFetch("/api/transactions/categories/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txIds: group.txIds, category }),
      }),
    onSuccess: (data: { updated?: number }) => {
      setDone(true);
      queryClient.invalidateQueries();
      toast({
        title: `${data?.updated ?? group.count} movimiento${(data?.updated ?? group.count) !== 1 ? "s" : ""} → ${categoryLabel(category)}`,
        description: "CODA aprenderá esta categoría para futuros movimientos del comercio.",
      });
    },
    onError: () => toast({ title: "No se pudo aplicar", variant: "destructive" }),
  });

  if (done) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{group.merchant}</p>
        <p className="text-xs text-muted-foreground">
          {group.count} mov{group.count !== 1 ? "s" : ""} · {CLP.format(group.total)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[190px] h-8 text-xs">
            <SelectValue placeholder="Elegir categoría…" />
          </SelectTrigger>
          <SelectContent>
            {ALL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 gap-1"
          disabled={!category || aplicar.isPending}
          onClick={() => aplicar.mutate()}
        >
          {aplicar.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Aplicar
        </Button>
      </div>
    </div>
  );
}

export default function CategoryReviewPanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<{ groups: ReviewGroup[]; pending: number }>({
    queryKey: ["/api/transactions/review-groups"],
    queryFn: () => apiFetch("/api/transactions/review-groups"),
  });

  const groups = data?.groups ?? [];
  const pending = data?.pending ?? 0;
  if (!isLoading && pending === 0) return null;

  return (
    <Card className="rounded-2xl border-amber-200 dark:border-amber-500/20">
      <CardContent className="p-4">
        <button
          className="w-full flex items-center justify-between gap-3 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ListChecks className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Revisar categorías ({pending})
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Agrupados por comercio — corrige un grupo completo con un clic y CODA aprende.
              </p>
            </div>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {open &&
          (isLoading ? (
            <Skeleton className="h-20 rounded-xl mt-3" />
          ) : (
            <div className="mt-2 divide-y divide-border/60 max-h-[420px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((g) => (
                <GroupRow key={g.merchant} group={g} />
              ))}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
