import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  Building2,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Lock,
  Plus,
  Trash2,
  Play,
  ArrowLeft,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import {
  useLenderVariables,
  useLenderSimulation,
  type PolicyCriterion,
  type PolicyOperator,
  type VariableClass,
  type B2BVariable,
} from "@/hooks/useLenderConsole";

/** Variables exponibles que son booleanas (op forzado a "==", umbral true/false). */
const BOOLEAN_VARS = new Set(["moraActiva"]);

/** Operador por defecto según si "más alto es mejor" o "más bajo es mejor". */
const HIGHER_IS_BETTER = new Set([
  "ahorroIngreso",
  "historialCmf",
  "incomeRegularity",
  "tiposCredito",
  "incomeTrend30_90",
  "activeDaysShare",
]);

const CLASS_META: Record<
  VariableClass,
  { label: string; help: string; icon: typeof ShieldCheck; badge: string; tone: string }
> = {
  exposable: {
    label: "Exponibles",
    help: "Predictores financieros legítimos. El prestador puede fijar cortes sobre estas.",
    icon: ShieldCheck,
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  proxy_risk: {
    label: "Proxy de riesgo",
    help: "Pueden correlacionar con atributos protegidos. No se exponen para fijar política.",
    icon: ShieldAlert,
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    tone: "text-amber-600 dark:text-amber-400",
  },
  protected: {
    label: "Protegidas",
    help: "Atributos sensibles (edad, género, comuna…). Prohibido discriminar por ellas.",
    icon: Ban,
    badge: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    tone: "text-red-600 dark:text-red-400",
  },
  internal: {
    label: "Internas",
    help: "Salidas del modelo de CODA. No se entregan crudas al prestador.",
    icon: Lock,
    badge: "bg-muted text-muted-foreground",
    tone: "text-muted-foreground",
  },
};

const OPERATORS: PolicyOperator[] = [">=", "<=", ">", "<", "=="];

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export default function ConsolaPrestador() {
  const { data, isLoading, isError } = useLenderVariables();
  const sim = useLenderSimulation();

  const exposable = data?.catalog.exposable ?? [];
  const exposableById = useMemo(() => new Map(exposable.map((v) => [v.id, v])), [exposable]);

  const [criteria, setCriteria] = useState<PolicyCriterion[]>([]);
  // Estado del "agregar criterio".
  const [draftVar, setDraftVar] = useState<string>("");
  const [draftOp, setDraftOp] = useState<PolicyOperator>("<=");
  const [draftThreshold, setDraftThreshold] = useState<string>("");
  const [draftBool, setDraftBool] = useState<"true" | "false">("false");

  const draftIsBool = BOOLEAN_VARS.has(draftVar);

  function onPickVar(id: string) {
    setDraftVar(id);
    if (BOOLEAN_VARS.has(id)) {
      setDraftOp("==");
    } else {
      setDraftOp(HIGHER_IS_BETTER.has(id) ? ">=" : "<=");
    }
  }

  // Al cambiar la política, el resultado anterior queda obsoleto: se descarta para no mostrar
  // una tasa que ya no corresponde a los criterios en pantalla.
  function invalidateResult() {
    if (sim.data || sim.isError) sim.reset();
  }

  function addCriterion() {
    if (!draftVar) return;
    const v = exposableById.get(draftVar);
    if (draftIsBool) {
      setCriteria((cs) => [
        ...cs.filter((c) => c.variable !== draftVar),
        { variable: draftVar, op: "==", threshold: draftBool === "true", label: v?.label },
      ]);
    } else {
      const num = Number(draftThreshold);
      if (!Number.isFinite(num)) return;
      setCriteria((cs) => [
        ...cs.filter((c) => c.variable !== draftVar),
        { variable: draftVar, op: draftOp, threshold: num, label: v?.label },
      ]);
    }
    invalidateResult();
    setDraftVar("");
    setDraftThreshold("");
  }

  function removeCriterion(variable: string) {
    setCriteria((cs) => cs.filter((c) => c.variable !== variable));
    invalidateResult();
  }

  function runSimulation() {
    sim.mutate({ name: "Política demo", criteria });
  }

  const result = sim.data;

  return (
    <>
      <Helmet>
        <title>Consola del prestador · CODA Empresas</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-foreground">
              CODA <span className="font-normal text-muted-foreground">· Empresas</span>
            </span>
          </div>
          <Link
            href="/empresas"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        </div>
      </header>

      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Consola del prestador</h1>
            <p className="text-sm text-muted-foreground">
              Define tu política de crédito sobre variables permitidas y simúlala.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-snug text-muted-foreground">
            Demo. La simulación corre sobre un <strong>cohorte sintético</strong> — nunca sobre
            personas reales. Un prestador jamás ve datos individuales: solo fija cortes y obtiene
            tasas agregadas.
          </p>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </CardContent>
          </Card>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">
            No pudimos cargar el catálogo de variables. Intenta más tarde.
          </p>
        )}

        {data && (
          <>
            {/* R4 — Catálogo de variables */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Qué variables puedes usar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(Object.keys(CLASS_META) as VariableClass[]).map((clazz) => {
                  const vars = data.catalog[clazz] ?? [];
                  if (vars.length === 0) return null;
                  const meta = CLASS_META[clazz];
                  const Icon = meta.icon;
                  return (
                    <div key={clazz}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", meta.tone)} />
                        <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">· {meta.help}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {vars.map((v: B2BVariable) => (
                          <span
                            key={v.id}
                            title={v.rationale}
                            className={cn("rounded-md px-2 py-1 text-xs font-medium", meta.badge)}
                          >
                            {v.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* R5 — Constructor de política */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tu política de crédito</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-muted-foreground">Variable</label>
                    <Select value={draftVar} onValueChange={onPickVar}>
                      <SelectTrigger>
                        <SelectValue placeholder="Elegir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {exposable.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {draftIsBool ? (
                    <div className="w-full sm:w-40">
                      <label className="mb-1 block text-xs text-muted-foreground">Debe ser</label>
                      <Select
                        value={draftBool}
                        onValueChange={(v) => setDraftBool(v as "true" | "false")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Sin mora</SelectItem>
                          <SelectItem value="true">Con mora</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <>
                      <div className="w-full sm:w-24">
                        <label className="mb-1 block text-xs text-muted-foreground">Operador</label>
                        <Select
                          value={draftOp}
                          onValueChange={(v) => setDraftOp(v as PolicyOperator)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map((op) => (
                              <SelectItem key={op} value={op}>
                                {op}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-full sm:w-28">
                        <label className="mb-1 block text-xs text-muted-foreground">Umbral</label>
                        <Input
                          type="number"
                          step="any"
                          value={draftThreshold}
                          onChange={(e) => setDraftThreshold(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCriterion();
                            }
                          }}
                          placeholder="0.4"
                        />
                      </div>
                    </>
                  )}

                  <Button
                    onClick={addCriterion}
                    disabled={!draftVar || (!draftIsBool && draftThreshold === "")}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </Button>
                </div>

                {criteria.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no agregas criterios. Elige una variable, un corte y agrégalo.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {criteria.length} {criteria.length === 1 ? "criterio" : "criterios"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCriteria([]);
                          invalidateResult();
                        }}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Limpiar
                      </button>
                    </div>
                    {criteria.map((c) => (
                      <div
                        key={c.variable}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
                      >
                        <span className="text-sm text-foreground">
                          <span className="font-medium">{c.label ?? c.variable}</span>{" "}
                          <span className="text-muted-foreground">
                            {typeof c.threshold === "boolean"
                              ? c.threshold
                                ? "con mora"
                                : "sin mora"
                              : `${c.op} ${c.threshold}`}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => removeCriterion(c.variable)}
                          aria-label="Quitar criterio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={runSimulation}
                  disabled={criteria.length === 0 || sim.isPending}
                  className="w-full gap-2"
                >
                  <Play className={cn("h-4 w-4", sim.isPending && "animate-pulse")} />
                  {sim.isPending ? "Simulando…" : "Simular política"}
                </Button>
              </CardContent>
            </Card>

            {/* Resultado */}
            {sim.isError && (
              <p className="text-sm text-muted-foreground">
                No se pudo simular. Revisa tus criterios e intenta de nuevo.
              </p>
            )}

            {result && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resultado de la simulación</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-primary/5 px-3 py-3 text-center">
                      <div className="text-2xl font-bold tabular-nums text-primary">
                        {formatPct(result.simulation.approvalRate)}
                      </div>
                      <div className="text-xs text-muted-foreground">Tasa de aprobación</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-3 text-center">
                      <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {result.simulation.approved}
                      </div>
                      <div className="text-xs text-muted-foreground">Aprobados</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-3 text-center">
                      <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                        {result.simulation.rejected}
                      </div>
                      <div className="text-xs text-muted-foreground">Rechazados</div>
                    </div>
                  </div>

                  {result.validation.nonExposable.length > 0 && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/20">
                      <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <p className="text-xs leading-snug text-red-700 dark:text-red-300">
                        Se ignoraron criterios sobre variables no permitidas (
                        {result.validation.nonExposable.join(", ")}). El guard de equidad no deja
                        discriminar por atributos protegidos.
                      </p>
                    </div>
                  )}

                  {Object.keys(result.simulation.failuresByVariable).length > 0 && (
                    <div>
                      <div className="mb-2 text-sm font-medium text-foreground">
                        Qué criterio rechaza más
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(result.simulation.failuresByVariable)
                          .sort((a, b) => b[1] - a[1])
                          .map(([variable, count]) => {
                            const label = exposableById.get(variable)?.label ?? variable;
                            const share = result.simulation.total
                              ? count / result.simulation.total
                              : 0;
                            return (
                              <div key={variable}>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-foreground">{label}</span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {count} ({formatPct(share)})
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-red-400"
                                    style={{ width: `${Math.round(share * 100)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {result.examples.length > 0 && (
                    <div>
                      <div className="mb-2 text-sm font-medium text-foreground">
                        Muestra de decisiones
                      </div>
                      <div className="space-y-1.5">
                        {result.examples.map((ex, i) => {
                          const approved = ex.decision === "approve";
                          const failedLabels = ex.failed.map(
                            (v) => exposableById.get(v)?.label ?? v,
                          );
                          const df = ex.values.deudaFlujo;
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "h-2 w-2 shrink-0 rounded-full",
                                    approved ? "bg-emerald-500" : "bg-red-500",
                                  )}
                                />
                                <span className="text-muted-foreground">
                                  Perfil sintético #{i + 1}
                                  {typeof df === "number" && <> · DSTI {Math.round(df * 100)}%</>}
                                  {ex.values.moraActiva ? " · con mora" : ""}
                                </span>
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 font-medium",
                                  approved
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400",
                                )}
                              >
                                {approved
                                  ? "Aprobado"
                                  : `Rechazado${failedLabels.length ? ` · ${failedLabels.join(", ")}` : ""}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Simulado sobre {result.cohort.size} perfiles sintéticos. Ajusta los cortes para
                    calibrar tu apetito de riesgo.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
