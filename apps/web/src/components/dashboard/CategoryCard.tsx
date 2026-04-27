import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { ChevronDown, Tag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";
import { getPersonalToken } from "@/lib/auth";
import { CATEGORY_TAXONOMY, categoryLabel } from "@/lib/categoryTaxonomy";
import type { CategoryGroup, DashboardTransaction } from "@/types/dashboard";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (fecha: string) => {
  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
};

const CHART_COLORS: Record<string, string> = {
  green: "#10b981",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  orange: "#f59e0b",
  red: "#ef4444",
};

/** All valid categories flattened from taxonomy for the recategorize picker */
const ALL_CATEGORIES = CATEGORY_TAXONOMY.flatMap((g) =>
  g.parserCategories.map((cat) => ({
    key: cat,
    label: categoryLabel(cat),
    groupLabel: g.label,
    groupKey: g.key,
  })),
);

const PAGE_SIZE = 20;

interface CategoryCardProps {
  group: CategoryGroup;
}

export default function CategoryCard({ group }: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);

  const isEmpty = group.total === 0 && group.subcategories.length === 0;

  // All transactions across subcategories, sorted by date desc
  const allTransactions = expanded
    ? group.subcategories
        .flatMap((sub) => sub.transactions)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    : [];

  const totalPages = Math.ceil(allTransactions.length / PAGE_SIZE);
  const pagedTransactions = allTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sparklineData = group.sparklineData.map((v, i) => ({ i, v }));
  const chartColor = CHART_COLORS[group.color] ?? "#6b7280";
  const Icon = group.icon;

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-5">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{group.label}: sin movimientos en este período</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md hover:shadow-primary/5">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => { setExpanded((e) => !e); setPage(0); }}
        className="w-full text-left p-5 flex items-center gap-4"
      >
        <Icon className={cn("h-5 w-5 shrink-0", `text-${group.color}-600 dark:text-${group.color}-400`)} style={{ color: chartColor }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{group.label}</p>
            <p className="text-sm font-bold tabular-nums text-foreground shrink-0">
              {fmtCLP(group.total)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-muted-foreground">{group.pctOfIncome}% del ingreso</p>
            {/* Sparkline mini */}
            <div className="w-20 h-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={chartColor}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 3 transactions */}
          {!expanded && group.topTransactions.length > 0 && (
            <div className="mt-3 space-y-1">
              {group.topTransactions.map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[60%]">
                    {tx.descripcion || tx.categoria}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {fmtCLP(tx.monto)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
            {/* Subcategories */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Subcategorías
              </p>
              {group.subcategories.map((sub) => (
                <div key={sub.key} className="flex items-center justify-between py-1">
                  <span className="text-sm text-foreground">{sub.label}</span>
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {fmtCLP(sub.total)}
                  </span>
                </div>
              ))}
            </div>

            {/* Full transaction list */}
            {pagedTransactions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Transacciones ({allTransactions.length})
                </p>
                <div className="space-y-1">
                  {pagedTransactions.map((tx, i) => (
                    <TransactionRow key={`${tx.id}-${i}`} tx={tx} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPage((p) => Math.max(0, p - 1)); }}
                      disabled={page === 0}
                      className="px-3 py-1 text-xs rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                    >
                      Anterior
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPage((p) => Math.min(totalPages - 1, p + 1)); }}
                      disabled={page >= totalPages - 1}
                      className="px-3 py-1 text-xs rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transaction row with recategorize ──────────────────────────────────────

function TransactionRow({ tx }: { tx: DashboardTransaction }) {
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const handleRecategorize = async (newCategory: string) => {
    if (newCategory === tx.categoria) {
      setShowPicker(false);
      return;
    }
    setSaving(true);
    try {
      const token = getPersonalToken();
      await apiFetch(`/api/transactions/${tx.id}/category`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category: newCategory }),
      });
      // Refresh dashboard data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/transactions/parsed"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/transactions/summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/transactions/insights"] }),
      ]);
    } catch {
      // silently fail — the category will stay as-is
    } finally {
      setSaving(false);
      setShowPicker(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors group">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground truncate">
            {tx.descripcion || tx.categoria}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground">{fmtDate(tx.fecha)}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setShowPicker((s) => !s); }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Cambiar categoría"
            >
              <Tag className="h-3 w-3" />
              {categoryLabel(tx.categoria)}
            </button>
          </div>
        </div>
        <span className={cn(
          "text-sm font-medium tabular-nums shrink-0 ml-3",
          tx.tipo === "ingreso" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
        )}>
          {tx.tipo === "ingreso" ? "+" : ""}{fmtCLP(tx.monto)}
        </span>
      </div>

      {/* Category picker dropdown */}
      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute left-2 top-full z-50 mt-1 w-64 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg py-1"
        >
          {saving && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!saving && CATEGORY_TAXONOMY.map((group) => (
            <div key={group.key}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              {group.parserCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={(e) => { e.stopPropagation(); handleRecategorize(cat); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                    cat === tx.categoria && "bg-primary/10 text-primary font-medium",
                  )}
                >
                  {categoryLabel(cat)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
