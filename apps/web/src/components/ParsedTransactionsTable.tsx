import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowUpDown, ArrowUp, ArrowDown, Upload, Download, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  INCOME_DISPLAY,
  EXPENSE_DISPLAY,
  categoryOptionsForTipo,
  displayCategoryLabel,
  displayCategoryColor,
  categoryLabel,
} from "@/lib/categoryTaxonomy";
import { useUserDocuments } from "@/hooks/useUserDocuments";
import DocumentManager from "@/components/DocumentManager";

interface ParsedTransaction {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  saldo: number | null;
  banco: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  categoria: string;
  /** Confianza 0..1 del motor de categorización (Batch 10). */
  category_confidence?: number;
  /** Requiere revisión manual de categoría (fuente única: backend reviewStatus). */
  requiresReview?: boolean;
  /** La categoría fue corregida manualmente por el usuario. */
  isManual?: boolean;
  /** Cuenta/producto de origen (tabla normalizada). */
  accountName?: string | null;
  accountType?: string | null;
  accountSubtype?: string | null;
  /** Clave de filtro: checking | tc_nacional | tc_internacional | tc. */
  product?: string;
  /** Etiqueta legible: "Santander · Cuenta corriente". */
  productLabel?: string;
  isInternalTransfer?: boolean;
}

const PRODUCT_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Producto: todos" },
  { value: "checking", label: "Cuenta corriente" },
  { value: "tc_nacional", label: "TC Nacional" },
  { value: "tc_internacional", label: "TC Internacional" },
];

type SortField = "fecha" | "descripcion" | "monto";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 40;

// ── Formatting ──────────────────────────────────────────────────────────────
const clpFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const formatClp = (n: number) => clpFmt.format(Math.abs(n));
const formatDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CAT_COLORS: Record<string, string> = {
  // Gastos esenciales
  vivienda: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  alimentacion: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  transporte: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  seguros: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  servicios_basicos: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  // Gastos personales
  salud_bienestar: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  educacion: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  cuidado_personal: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
  // Ocio y entretenimiento
  restaurantes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  diversion: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  hobbies: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
  suscripciones: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  // Gastos financieros
  deudas: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  inversiones: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  ahorros: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  // Gastos ocasionales
  regalos: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  reparaciones: "bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-400",
  imprevistos: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  // Legacy
  telecomunicaciones: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  transferencia_enviada: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  transferencia_recibida:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  comercio: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  entretenimiento: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  salud: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ingreso_principal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  servicios: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  otro: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

// ── Sort header ──────────────────────────────────────────────────────────────
function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sortField === field;
  return (
    <button
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide w-full",
        align === "right" && "justify-end",
      )}
      onClick={() => onSort(field)}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface ParsedTransactionsTableProps {
  /** "gastos" = solo egresos, sin filtro de tipo, sin saldo. "movimientos" = todo. Default: "movimientos" */
  mode?: "gastos" | "movimientos";
  /** Título personalizado */
  title?: string;
  /** Subtítulo personalizado */
  subtitle?: string;
  /** Pre-select a category filter (e.g. from pie chart drill-down) */
  initialCategory?: string;
  /** Abrir directamente con el filtro "Por revisar" activo (CTA del Panel). */
  initialReviewOnly?: boolean;
}

export default function ParsedTransactionsTable({
  mode = "movimientos",
  title,
  subtitle,
  initialCategory,
  initialReviewOnly,
}: ParsedTransactionsTableProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { documents } = useUserDocuments();
  const isGastos = mode === "gastos";
  const cartolaCount = documents.filter((doc) => doc.tipo === "cartola").length;

  const [search, setSearch] = useState("");
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "ingreso" | "egreso">(
    isGastos ? "egreso" : "all",
  );
  const [catFilter, setCatFilter] = useState<string>(initialCategory ?? "all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [reviewOnly, setReviewOnly] = useState(initialReviewOnly ?? false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ transactions: ParsedTransaction[]; count: number }>({
    queryKey: ["/api/transactions/parsed"],
    // Sin guard de token/sesión: `enabled: isAuthenticated` ya evita correr la query
    // logueado-fuera. Con auth cookie-only, devolver { transactions: [], count: 0 }
    // durante la hidratación (token null + mirror de sesión aún sin setear) se cacheaba
    // como éxito y dejaba un empty state falso ("Sin movimientos") aunque hubiera datos.
    // apiFetch va con credentials:"include", así que la cookie httpOnly autentica.
    queryFn: () => apiFetch("/api/transactions/parsed"),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // In gastos mode, pre-filter to only egresos before any user filters
  const rawTxs = data?.transactions ?? [];
  const allTxs = isGastos ? rawTxs.filter((t) => t.tipo === "egreso") : rawTxs;

  // Productos presentes (para mostrar sólo los filtros relevantes).
  const presentProducts = useMemo(() => {
    const set = new Set<string>();
    allTxs.forEach((t) => {
      if (t.product) set.add(t.product);
    });
    return set;
  }, [allTxs]);

  // Opciones del filtro = los labels de display presentes (ingreso + egreso),
  // en orden canónico (primero ingresos, luego egresos).
  const categories = useMemo(() => {
    const present = new Set<string>();
    allTxs.forEach((t) => {
      if (t.categoria) present.add(displayCategoryLabel(t.categoria, t.tipo));
    });
    const order = [...INCOME_DISPLAY, ...EXPENSE_DISPLAY].map((d) => d.label);
    return order.filter((l) => present.has(l));
  }, [allTxs]);

  // Pendientes por revisar (misma lógica que el badge: flag del backend).
  const pendingReviewCount = useMemo(() => allTxs.filter((t) => t.requiresReview).length, [allTxs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let txs = allTxs;
    if (reviewOnly) txs = txs.filter((t) => t.requiresReview);
    if (typeFilter !== "all") txs = txs.filter((t) => t.tipo === typeFilter);
    // Acepta filtro por label de display (dropdown) o por categoría fina (drill-down del dashboard vía URL).
    if (catFilter !== "all")
      txs = txs.filter(
        (t) => t.categoria === catFilter || displayCategoryLabel(t.categoria, t.tipo) === catFilter,
      );
    if (productFilter !== "all") txs = txs.filter((t) => t.product === productFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      txs = txs.filter((t) => t.descripcion.toLowerCase().includes(q));
    }
    if (dateFrom) txs = txs.filter((t) => t.fecha >= dateFrom);
    if (dateTo) txs = txs.filter((t) => t.fecha <= dateTo);

    return [...txs].sort((a, b) => {
      let cmp = 0;
      if (sortField === "fecha") cmp = a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
      else if (sortField === "descripcion") cmp = a.descripcion.localeCompare(b.descripcion, "es");
      else if (sortField === "monto") cmp = Math.abs(a.monto) - Math.abs(b.monto);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    allTxs,
    reviewOnly,
    typeFilter,
    catFilter,
    productFilter,
    search,
    dateFrom,
    dateTo,
    sortField,
    sortDir,
  ]);

  // ── Infinite scroll sentinel ─────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleItems = filtered.slice(0, page * PAGE_SIZE);

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && page < totalPages) {
        setPage((p) => p + 1);
      }
    },
    [page, totalPages],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    search,
    typeFilter,
    catFilter,
    productFilter,
    reviewOnly,
    dateFrom,
    dateTo,
    sortField,
    sortDir,
  ]);

  const hasActiveFilter =
    search ||
    typeFilter !== "all" ||
    catFilter !== "all" ||
    productFilter !== "all" ||
    reviewOnly ||
    dateFrom ||
    dateTo;

  // ── Category inline edit ────────────────────────────────────────────────
  const updateCategory = useCallback(
    async (txId: string, newCategory: string, oldCategory: string) => {
      // Optimistic update
      queryClient.setQueryData<{ transactions: ParsedTransaction[]; count: number }>(
        ["/api/transactions/parsed"],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            transactions: prev.transactions.map((t) =>
              t.id === txId
                ? { ...t, categoria: newCategory, requiresReview: false, isManual: true }
                : t,
            ),
          };
        },
      );
      try {
        const apiBase = (API_URL || "").replace(/\/$/, "");
        const res = await fetch(`${apiBase}/api/transactions/${txId}/category`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: newCategory }),
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        // Recategorizing affects dashboard totals, flow chart, insights, etc.
        queryClient.invalidateQueries();
      } catch {
        // Revert on error
        queryClient.setQueryData<{ transactions: ParsedTransaction[]; count: number }>(
          ["/api/transactions/parsed"],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              transactions: prev.transactions.map((t) =>
                t.id === txId ? { ...t, categoria: oldCategory } : t,
              ),
            };
          },
        );
        toast({
          title: "Error",
          description: "No se pudo actualizar la categoría. Intenta de nuevo.",
          variant: "destructive",
        });
      }
    },
    [queryClient, toast],
  );

  // Re-aplica el motor de categorización más reciente a TODOS los movimientos
  // (no pisa correcciones manuales). Mismo endpoint que el botón del panel.
  const handleRecategorize = useCallback(async () => {
    setIsRecategorizing(true);
    toast({
      title: "Recategorizando…",
      description: "Aplicando el motor más reciente a tus movimientos.",
    });
    try {
      const result = (await apiFetch("/api/admin/recategorize", { method: "POST" })) as {
        updated?: number;
        scanned?: number;
        aiCategorized?: number;
      };
      await queryClient.invalidateQueries();
      const updated = result?.updated ?? 0;
      const scanned = result?.scanned ?? 0;
      const ai = result?.aiCategorized ?? 0;
      const aiSuffix = ai > 0 ? ` · ${ai} identificadas con IA` : "";
      toast({
        title: "Categorías actualizadas",
        description:
          updated > 0
            ? `Se recategorizaron ${updated} de ${scanned} movimientos${aiSuffix}.`
            : `Los ${scanned} movimientos ya tenían la categoría correcta.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "No se pudieron recategorizar las transacciones.",
        variant: "destructive",
      });
    } finally {
      setIsRecategorizing(false);
    }
  }, [queryClient, toast]);

  // ── CSV export ──────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const rows = [
      ["Fecha", "Descripcion", "Categoria", "Tipo", "Monto", "Saldo", "Banco"],
      ...filtered.map((t) => [
        t.fecha,
        `"${t.descripcion.replace(/"/g, '""')}"`,
        categoryLabel(t.categoria),
        t.tipo,
        t.monto.toString(),
        t.saldo != null ? t.saldo.toString() : "",
        t.banco ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacciones-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          {allTxs.length > 0
            ? `${allTxs.length} ${isGastos ? "gastos" : "transacciones"} extraídos · mostrando ${visibleItems.length}`
            : (subtitle ??
              (isGastos
                ? "Sube una cartola para ver tus gastos categorizados"
                : "Transacciones extraídas de tus cartolas bancarias"))}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allTxs.length === 0 ? (
          <div className="text-center py-16 space-y-4 border-2 border-dashed border-muted rounded-lg">
            <div className="p-4 rounded-full bg-primary/10 mx-auto w-fit">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-lg">Sin movimientos</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Sube una cartola bancaria para ver tus transacciones aquí.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => window.dispatchEvent(new CustomEvent("trigger-cartola-upload"))}
              className="gap-2"
            >
              <Upload className="h-5 w-5" />
              Subir documento
            </Button>
          </div>
        ) : (
          <>
            {/* ── Filters ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                size="sm"
                onClick={() => window.dispatchEvent(new CustomEvent("trigger-cartola-upload"))}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                Subir documento
              </Button>
              {!isGastos && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5">
                      <Trash2 className="h-4 w-4" />
                      Borrar cartolas
                      {cartolaCount > 0 && (
                        <span className="rounded-full bg-muted px-1.5 text-[10px] leading-5 text-muted-foreground">
                          {cartolaCount}
                        </span>
                      )}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Borrar cartolas</DialogTitle>
                      <DialogDescription>
                        Elimina una cartola específica y sus movimientos derivados.
                      </DialogDescription>
                    </DialogHeader>
                    <DocumentManager documentType="cartola" showDeleteAll={false} showEmptyState />
                  </DialogContent>
                </Dialog>
              )}
              {!isGastos && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handleRecategorize}
                  disabled={isRecategorizing}
                  title="Vuelve a categorizar todos los movimientos con el motor más reciente (no toca tus correcciones manuales)"
                >
                  <RotateCcw className={cn("h-4 w-4", isRecategorizing && "animate-spin")} />
                  {isRecategorizing ? "Recategorizando…" : "Recategorizar"}
                </Button>
              )}

              <Input
                placeholder="Buscar descripción..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-[200px] h-8 text-sm"
              />

              {/* Filtro rápido "Por revisar": misma lógica que el badge (flag del backend). */}
              {(pendingReviewCount > 0 || reviewOnly) && (
                <Button
                  variant={reviewOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setReviewOnly((v) => !v)}
                  title="Mostrar solo movimientos con categoría por revisar"
                >
                  Por revisar
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] leading-5 font-semibold",
                      reviewOnly
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                    )}
                  >
                    {pendingReviewCount}
                  </span>
                </Button>
              )}

              {!isGastos && (
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tipo: todos</SelectItem>
                    <SelectItem value="ingreso">Ingresos</SelectItem>
                    <SelectItem value="egreso">Egresos</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {categories.length > 1 && (
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Categoría: todas</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {presentProducts.size > 1 && (
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_FILTERS.filter(
                      (p) => p.value === "all" || presentProducts.has(p.value),
                    ).map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Desde</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-36 h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Hasta</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-36 h-8 text-xs"
                />
              </div>

              {hasActiveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setSearch("");
                    setTypeFilter("all");
                    setCatFilter("all");
                    setProductFilter("all");
                    setReviewOnly(false);
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>

            {/* ── Table ──────────────────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2.5 text-left">
                      <SortHeader
                        label="Fecha"
                        field="fecha"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <SortHeader
                        label="Descripción"
                        field="descripcion"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-center hidden sm:table-cell">Categoría</th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader
                        label="Monto"
                        field="monto"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        align="right"
                      />
                    </th>
                    {!isGastos && (
                      <th className="px-3 py-2.5 text-right hidden md:table-cell text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Saldo
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isGastos ? 4 : 5}
                        className="px-3 py-8 text-center text-muted-foreground text-sm"
                      >
                        {reviewOnly
                          ? "Todo al día. No tienes movimientos pendientes por revisar."
                          : "Sin resultados para los filtros aplicados."}
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                          {formatDate(tx.fecha)}
                        </td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <span className="block truncate text-sm" title={tx.descripcion}>
                            {tx.descripcion || "—"}
                          </span>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            {(tx.productLabel || tx.banco) && (
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                                {tx.productLabel || tx.banco}
                              </span>
                            )}
                            {tx.isInternalTransfer && (
                              <span
                                className="text-[10px] font-medium text-sky-600 dark:text-sky-400"
                                title="Transferencia entre productos propios — se excluye de ingresos/gastos reales"
                              >
                                interna
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center hidden sm:table-cell">
                          {/* Selector SEGÚN EL TIPO: egreso → Necesidades/Deseos/Ahorro/
                              Transferencia; ingreso → fuentes de ingreso. requiresReview
                              (sin clasificar) → "Sin categoría", se resuelve con 1 toque. */}
                          <Select
                            value={
                              tx.requiresReview ? "" : displayCategoryLabel(tx.categoria, tx.tipo)
                            }
                            onValueChange={(label) => {
                              // Re-elegir el mismo label (misma etiqueta de display) no
                              // toca la categoría fina; cualquier otro caso guarda el
                              // canónico de la opción elegida.
                              if (
                                !tx.requiresReview &&
                                label === displayCategoryLabel(tx.categoria, tx.tipo)
                              ) {
                                return;
                              }
                              const opt = categoryOptionsForTipo(tx.tipo).find(
                                (o) => o.label === label,
                              );
                              if (opt) updateCategory(tx.id, opt.canonical, tx.categoria);
                            }}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-6 w-auto min-w-[90px] max-w-[190px] px-1.5 text-[10px] font-medium rounded-full inline-flex",
                                tx.requiresReview
                                  ? "border border-dashed border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                                  : cn(
                                      "border-0 bg-transparent",
                                      displayCategoryColor(tx.categoria, tx.tipo),
                                    ),
                              )}
                            >
                              {/* Texto directo (no SelectValue): con value="" para las
                                  sin clasificar, SelectValue no renderiza los children. */}
                              <span className="truncate">
                                {tx.requiresReview
                                  ? "Sin categoría"
                                  : displayCategoryLabel(tx.categoria, tx.tipo)}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptionsForTipo(tx.tipo).map((o) => (
                                <SelectItem key={o.label} value={o.label} className="text-xs">
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-semibold whitespace-nowrap text-sm",
                            isGastos
                              ? "text-foreground"
                              : tx.tipo === "ingreso"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400",
                          )}
                        >
                          {isGastos
                            ? formatClp(tx.monto)
                            : `${tx.tipo === "ingreso" ? "+" : "−"}${formatClp(tx.monto)}`}
                        </td>
                        {!isGastos && (
                          <td className="px-3 py-2 text-right text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">
                            {tx.saldo != null ? formatClp(tx.saldo) : "—"}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-4" />
            </div>

            {/* Summary for movimientos mode */}
            {!isGastos && filtered.length > 0 && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Ingresos</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    +
                    {formatClp(
                      filtered
                        .filter((t) => t.tipo === "ingreso")
                        .reduce((sum, t) => sum + Math.abs(t.monto), 0),
                    )}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Egresos</p>
                  <p className="text-sm font-semibold text-red-600">
                    −
                    {formatClp(
                      filtered
                        .filter((t) => t.tipo === "egreso")
                        .reduce((sum, t) => sum + Math.abs(t.monto), 0),
                    )}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      filtered.reduce((sum, t) => sum + t.monto, 0) >= 0
                        ? "text-emerald-600"
                        : "text-red-600",
                    )}
                  >
                    {formatClp(filtered.reduce((sum, t) => sum + t.monto, 0))}
                  </p>
                </div>
              </div>
            )}

            {/* Summary for gastos mode */}
            {isGastos && filtered.length > 0 && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total Gastos</p>
                  <p className="text-sm font-semibold text-red-600">
                    {formatClp(filtered.reduce((sum, t) => sum + Math.abs(t.monto), 0))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Promedio por Gasto</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatClp(
                      filtered.reduce((sum, t) => sum + Math.abs(t.monto), 0) / filtered.length,
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Footer summary */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>
                {filtered.length} movimiento{filtered.length !== 1 ? "s" : ""}
                {hasActiveFilter
                  ? " (filtrado" +
                    (filtered.length !== allTxs.length ? `s de ${allTxs.length}` : "") +
                    ")"
                  : ""}
              </span>
              <div className="flex items-center gap-3">
                {page < totalPages && (
                  <span
                    className="text-primary cursor-pointer hover:underline"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Cargar más ↓
                  </span>
                )}
                {filtered.length > 0 && (
                  <button
                    onClick={exportCsv}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Exportar a CSV"
                  >
                    <Download className="h-3 w-3" />
                    Exportar CSV
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
