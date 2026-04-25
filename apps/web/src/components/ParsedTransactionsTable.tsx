import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, API_URL } from "@/lib/api";
import { useAuth, getPersonalToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
}

type SortField = "fecha" | "descripcion" | "monto";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 40;

// ── Formatting ──────────────────────────────────────────────────────────────
const clpFmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const formatClp  = (n: number) => clpFmt.format(Math.abs(n));
const formatDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
};

// ── Category meta ────────────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  alimentacion:           "Alimentación",
  transporte:             "Transporte",
  entretenimiento:        "Entretenimiento",
  telecomunicaciones:     "Telecomunicaciones",
  transferencia_enviada:  "Transferencia",
  transferencia_recibida: "Transferencia",
  comercio:               "Comercio",
  educacion:              "Educación",
  salud:                  "Salud",
  ingreso_principal:      "Ingreso",
  vivienda:               "Vivienda",
  servicios:              "Servicios",
  otro:                   "Otro",
};

/** All valid categories for the dropdown — must match backend VALID_CATEGORIES */
const ALL_CATEGORIES = [
  "alimentacion", "transporte", "entretenimiento", "telecomunicaciones",
  "transferencia_enviada", "transferencia_recibida", "comercio",
  "educacion", "salud", "ingreso_principal", "vivienda", "servicios", "otro",
] as const;

const CAT_COLORS: Record<string, string> = {
  alimentacion:           "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  transporte:             "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  entretenimiento:        "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  telecomunicaciones:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  transferencia_enviada:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  transferencia_recibida: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  comercio:               "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  educacion:              "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  salud:                  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ingreso_principal:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  vivienda:               "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  servicios:              "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  otro:                   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

// ── Sort header ──────────────────────────────────────────────────────────────
function SortHeader({ label, field, sortField, sortDir, onSort, align = "left" }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sortField === field;
  return (
    <button
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide w-full",
        align === "right" && "justify-end"
      )}
      onClick={() => onSort(field)}
    >
      {label}
      {active
        ? sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        : <ArrowUpDown className="h-3 w-3 opacity-40" />}
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
}

export default function ParsedTransactionsTable({ mode = "movimientos", title, subtitle, initialCategory }: ParsedTransactionsTableProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isGastos = mode === "gastos";

  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "ingreso" | "egreso">(isGastos ? "egreso" : "all");
  const [catFilter, setCatFilter]   = useState<string>(initialCategory ?? "all");
  const [bancoFilter, setBancoFilter] = useState<string>("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [sortField, setSortField]   = useState<SortField>("fecha");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [page, setPage]             = useState(1);

  const { data, isLoading } = useQuery<{ transactions: ParsedTransaction[]; count: number }>({
    queryKey: ["/api/transactions/parsed"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token) return { transactions: [], count: 0 };
      return apiFetch("/api/transactions/parsed", { headers: { Authorization: `Bearer ${token}` } });
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // In gastos mode, pre-filter to only egresos before any user filters
  const rawTxs = data?.transactions ?? [];
  const allTxs = isGastos ? rawTxs.filter(t => t.tipo === "egreso") : rawTxs;

  // Derived filter options
  const banks = useMemo(() => {
    const set = new Set<string>();
    allTxs.forEach(t => { if (t.banco) set.add(t.banco); });
    return Array.from(set).sort();
  }, [allTxs]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    allTxs.forEach(t => { if (t.categoria) set.add(t.categoria); });
    return Array.from(set).sort();
  }, [allTxs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let txs = allTxs;
    if (typeFilter !== "all") txs = txs.filter(t => t.tipo === typeFilter);
    if (catFilter !== "all")  txs = txs.filter(t => t.categoria === catFilter);
    if (bancoFilter !== "all") txs = txs.filter(t => t.banco === bancoFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      txs = txs.filter(t => t.descripcion.toLowerCase().includes(q));
    }
    if (dateFrom) txs = txs.filter(t => t.fecha >= dateFrom);
    if (dateTo)   txs = txs.filter(t => t.fecha <= dateTo);

    return [...txs].sort((a, b) => {
      let cmp = 0;
      if (sortField === "fecha") cmp = a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
      else if (sortField === "descripcion") cmp = a.descripcion.localeCompare(b.descripcion, "es");
      else if (sortField === "monto") cmp = Math.abs(a.monto) - Math.abs(b.monto);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allTxs, typeFilter, catFilter, bancoFilter, search, dateFrom, dateTo, sortField, sortDir]);

  // ── Infinite scroll sentinel ─────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleItems = filtered.slice(0, page * PAGE_SIZE);

  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting && page < totalPages) {
      setPage(p => p + 1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, typeFilter, catFilter, bancoFilter, dateFrom, dateTo, sortField, sortDir]);

  const hasActiveFilter = search || typeFilter !== "all" || catFilter !== "all" || bancoFilter !== "all" || dateFrom || dateTo;

  // ── Category inline edit ────────────────────────────────────────────────
  const updateCategory = useCallback(async (txId: string, newCategory: string, oldCategory: string) => {
    // Optimistic update
    queryClient.setQueryData<{ transactions: ParsedTransaction[]; count: number }>(
      ["/api/transactions/parsed"],
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === txId ? { ...t, categoria: newCategory } : t
          ),
        };
      }
    );
    try {
      const token = getPersonalToken() ?? "";
      const apiBase = (API_URL || "").replace(/\/$/, "");
      const res = await fetch(`${apiBase}/api/transactions/${txId}/category`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      // Invalidate summaries so charts refresh
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
    } catch {
      // Revert on error
      queryClient.setQueryData<{ transactions: ParsedTransaction[]; count: number }>(
        ["/api/transactions/parsed"],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            transactions: prev.transactions.map((t) =>
              t.id === txId ? { ...t, categoria: oldCategory } : t
            ),
          };
        }
      );
      toast({
        title: "Error",
        description: "No se pudo actualizar la categoría. Intenta de nuevo.",
        variant: "destructive",
      });
    }
  }, [queryClient, toast]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          {allTxs.length > 0
            ? `${allTxs.length} ${isGastos ? 'gastos' : 'transacciones'} extraídos · mostrando ${visibleItems.length}`
            : (subtitle ?? (isGastos ? "Sube una cartola para ver tus gastos categorizados" : "Transacciones extraídas de tus cartolas bancarias"))}
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
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Sube una cartola bancaria para ver tus transacciones aquí.</p>
            </div>
            <Button
              size="lg"
              onClick={() => window.dispatchEvent(new CustomEvent('trigger-cartola-upload'))}
              className="gap-2"
            >
              <Upload className="h-5 w-5" />
              Subir cartola
            </Button>
          </div>
        ) : (
          <>
            {/* ── Filters ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                size="sm"
                onClick={() => window.dispatchEvent(new CustomEvent('trigger-cartola-upload'))}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                Subir cartola
              </Button>

              <Input
                placeholder="Buscar descripción..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-[200px] h-8 text-sm"
              />

              {!isGastos && (
                <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
                  <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tipo: todos</SelectItem>
                    <SelectItem value="ingreso">Ingresos</SelectItem>
                    <SelectItem value="egreso">Egresos</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {categories.length > 1 && (
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Categoría: todas</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{CAT_LABELS[c] ?? c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {banks.length > 1 && (
                <Select value={bancoFilter} onValueChange={setBancoFilter}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Banco: todos</SelectItem>
                    {banks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Desde</span>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Hasta</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-xs" />
              </div>

              {hasActiveFilter && (
                <Button variant="ghost" size="sm" className="h-8 text-xs"
                  onClick={() => { setSearch(""); setTypeFilter("all"); setCatFilter("all"); setBancoFilter("all"); setDateFrom(""); setDateTo(""); }}>
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
                      <SortHeader label="Fecha" field="fecha" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-left">
                      <SortHeader label="Descripción" field="descripcion" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-center hidden sm:table-cell">Categoría</th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader label="Monto" field="monto" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                    </th>
                    {!isGastos && (
                      <th className="px-3 py-2.5 text-right hidden md:table-cell text-xs font-medium text-muted-foreground uppercase tracking-wide">Saldo</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={isGastos ? 4 : 5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                        Sin resultados para los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map(tx => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                          {formatDate(tx.fecha)}
                        </td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <span className="block truncate text-sm" title={tx.descripcion}>
                            {tx.descripcion || "—"}
                          </span>
                          {tx.banco && (
                            <span className="text-[10px] text-muted-foreground">{tx.banco}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center hidden sm:table-cell">
                          <Select
                            value={tx.categoria}
                            onValueChange={(val) => updateCategory(tx.id, val, tx.categoria)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-6 w-auto min-w-[90px] max-w-[130px] border-0 bg-transparent px-1.5 text-[10px] font-medium rounded-full inline-flex",
                                CAT_COLORS[tx.categoria] ?? CAT_COLORS.otro
                              )}
                            >
                              <SelectValue>{CAT_LABELS[tx.categoria] ?? tx.categoria}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c} className="text-xs">
                                  {CAT_LABELS[c] ?? c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className={cn(
                          "px-3 py-2 text-right font-semibold whitespace-nowrap text-sm",
                          isGastos
                            ? "text-foreground"
                            : tx.tipo === "ingreso" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                        )}>
                          {isGastos ? formatClp(tx.monto) : `${tx.tipo === "ingreso" ? "+" : "−"}${formatClp(tx.monto)}`}
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
                    +{formatClp(filtered.filter(t => t.tipo === "ingreso").reduce((sum, t) => sum + Math.abs(t.monto), 0))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Egresos</p>
                  <p className="text-sm font-semibold text-red-600">
                    −{formatClp(filtered.filter(t => t.tipo === "egreso").reduce((sum, t) => sum + Math.abs(t.monto), 0))}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className={cn(
                    "text-sm font-semibold",
                    filtered.reduce((sum, t) => sum + t.monto, 0) >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
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
                    {formatClp(filtered.reduce((sum, t) => sum + Math.abs(t.monto), 0) / filtered.length)}
                  </p>
                </div>
              </div>
            )}

            {/* Footer summary */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>
                {filtered.length} movimiento{filtered.length !== 1 ? "s" : ""}
                {hasActiveFilter ? " (filtrado" + (filtered.length !== allTxs.length ? `s de ${allTxs.length}` : "") + ")" : ""}
              </span>
              {page < totalPages && (
                <span className="text-primary cursor-pointer hover:underline" onClick={() => setPage(p => p + 1)}>
                  Cargar más ↓
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
