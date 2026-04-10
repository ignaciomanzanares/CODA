import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

type SortField = "fecha" | "descripcion" | "monto";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const clpFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatClp(n: number) {
  return clpFormat.format(Math.abs(n));
}

function formatDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide"
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

export default function ParsedTransactionsTable() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "ingreso" | "egreso">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ transactions: ParsedTransaction[]; count: number }>({
    queryKey: ["/api/transactions/parsed"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) return { transactions: [], count: 0 };
      return apiFetch("/api/transactions/parsed", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  const allTxs = data?.transactions ?? [];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let txs = allTxs;

    if (typeFilter !== "all") {
      txs = txs.filter((t) => t.tipo === typeFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      txs = txs.filter((t) => t.descripcion.toLowerCase().includes(q));
    }

    if (dateFrom) {
      txs = txs.filter((t) => t.fecha >= dateFrom);
    }
    if (dateTo) {
      txs = txs.filter((t) => t.fecha <= dateTo);
    }

    txs = [...txs].sort((a, b) => {
      let cmp = 0;
      if (sortField === "fecha") {
        cmp = a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
      } else if (sortField === "descripcion") {
        cmp = a.descripcion.localeCompare(b.descripcion, "es");
      } else if (sortField === "monto") {
        cmp = Math.abs(a.monto) - Math.abs(b.monto);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return txs;
  }, [allTxs, typeFilter, search, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Movimientos de cartolas
        </CardTitle>
        <CardDescription>
          Transacciones extraídas de tus cartolas bancarias subidas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allTxs.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium text-muted-foreground">Sin movimientos</p>
            <p className="text-sm text-muted-foreground">
              Sube una cartola bancaria para ver tus transacciones aquí.
            </p>
            <Button size="sm" onClick={() => navigate(ROUTES.panel)}>
              Subir cartola
            </Button>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                placeholder="Buscar descripción..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="max-w-xs h-8 text-sm"
              />
              <Select
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v as any); setPage(1); }}
              >
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ingreso">Ingresos</SelectItem>
                  <SelectItem value="egreso">Egresos</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>Desde</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-36 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>Hasta</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-36 h-8 text-sm"
                />
              </div>
              {(search || typeFilter !== "all" || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setSearch(""); setTypeFilter("all"); setDateFrom(""); setDateTo(""); setPage(1); }}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">
                      <SortHeader label="Fecha" field="fecha" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <SortHeader label="Descripción" field="descripcion" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2 text-center">Tipo</th>
                    <th className="px-3 py-2 text-right">
                      <SortHeader label="Monto" field="monto" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2 text-right hidden md:table-cell">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">
                        Sin resultados para los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                          {formatDate(tx.fecha)}
                        </td>
                        <td className="px-3 py-2 max-w-[240px] truncate" title={tx.descripcion}>
                          {tx.descripcion || "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs",
                              tx.tipo === "ingreso"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            )}
                          >
                            {tx.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                          </Badge>
                        </td>
                        <td className={cn(
                          "px-3 py-2 text-right font-medium whitespace-nowrap",
                          tx.tipo === "ingreso" ? "text-green-600" : "text-red-600"
                        )}>
                          {tx.tipo === "ingreso" ? "+" : "-"}{formatClp(tx.monto)}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">
                          {tx.saldo != null ? formatClp(tx.saldo) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {filtered.length} movimiento{filtered.length !== 1 ? "s" : ""} ·
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
