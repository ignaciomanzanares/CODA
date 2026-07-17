import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi, apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { mapUserFacingApiError } from "@/lib/userFacingErrors";
import { Analytics } from "@/lib/analytics";
import { hapticLight } from "@/lib/haptics";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Target,
  PiggyBank,
  GraduationCap,
  Home,
  CreditCard,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Calendar,
} from "lucide-react";
import SignInBanner from "@/components/SignInBanner";
import { inlineMarkdownToHtml } from "@/lib/markdown";
import type { Goal, UpdateGoalData } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancialSummary {
  summary: {
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
  };
}

interface PlanRecommendation {
  id: string;
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
}

interface PlanInsightsData {
  recommendations: PlanRecommendation[];
  summaryBanner: string;
  hasData: boolean;
}

// ── Goal form schema (same as Goals.tsx) ─────────────────────────────────────

const goalFormSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    targetAmount: z.coerce.number().min(1, "El monto objetivo es obligatorio"),
    currentAmount: z.coerce.number().min(0, "El monto actual debe ser 0 o más"),
    targetDate: z.string().min(1, "La fecha objetivo es obligatoria"),
    category: z.enum(["savings", "debt_repayment", "retirement", "home", "education", "other"]),
  })
  .refine((d) => d.targetDate >= new Date().toISOString().slice(0, 10), {
    message: "La fecha objetivo no puede ser en el pasado",
    path: ["targetDate"],
  })
  .refine((d) => d.currentAmount <= d.targetAmount, {
    message: "El monto actual no puede superar el monto objetivo",
    path: ["currentAmount"],
  });
type GoalFormValues = z.infer<typeof goalFormSchema>;

function isOptimisticId(id: unknown): boolean {
  return typeof id === "number" && id > 10_000_000_000;
}

// ── Goal category metadata ────────────────────────────────────────────────────

const CATEGORY_META: Record<
  Goal["category"],
  { label: string; icon: React.ElementType; color: string }
> = {
  savings: { label: "Ahorro", icon: PiggyBank, color: "text-emerald-600 dark:text-emerald-400" },
  debt_repayment: {
    label: "Pago de deuda",
    icon: CreditCard,
    color: "text-red-500 dark:text-red-400",
  },
  retirement: {
    label: "Jubilación",
    icon: Briefcase,
    color: "text-violet-600 dark:text-violet-400",
  },
  home: { label: "Vivienda", icon: Home, color: "text-blue-600 dark:text-blue-400" },
  education: {
    label: "Educación",
    icon: GraduationCap,
    color: "text-amber-600 dark:text-amber-400",
  },
  other: { label: "Otro", icon: Target, color: "text-slate-500" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

// ── 50/30/20 visualization ────────────────────────────────────────────────────

function BudgetBar({
  label,
  actual,
  target,
  amount,
  color,
  bgColor,
}: {
  label: string;
  actual: number;
  target: number;
  amount: number;
  color: string;
  bgColor: string;
}) {
  const over = actual > target;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              over ? "text-red-500" : "text-muted-foreground",
            )}
          >
            {actual}% <span className="text-muted-foreground font-normal">/ {target}% meta</span>
          </span>
          {over ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </div>
      </div>
      {/* Stacked bar: actual vs target */}
      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground/20 z-10"
          style={{ left: `${Math.min(target, 100)}%` }}
        />
        {/* Actual bar */}
        <div
          className={cn(
            "absolute top-0 left-0 bottom-0 rounded-full transition-all duration-700",
            bgColor,
          )}
          style={{ width: `${Math.min(actual, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{CLP.format(amount)}/mes</p>
    </div>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  onEdit: (g: Goal) => void;
  onDelete: (id: string) => void;
}) {
  const meta = CATEGORY_META[goal.category];
  const Icon = meta.icon;
  const progress =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
      : 0;
  const done = progress >= 100;
  const daysLeft = goal.targetDate
    ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className="rounded-2xl border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted",
              )}
            >
              <Icon className={cn("h-4 w-4", meta.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{goal.name}</p>
              <p className="text-xs text-muted-foreground">{meta.label}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(goal)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar esta meta?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(String(goal.id))}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Progress value={progress} className="h-2" />

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground tabular-nums">
            {CLP.format(goal.currentAmount)} / {CLP.format(goal.targetAmount)}
          </span>
          <div className="flex items-center gap-1.5">
            {done ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-0 text-[10px]">
                <CheckCircle className="h-3 w-3 mr-1" /> Completada
              </Badge>
            ) : daysLeft !== null ? (
              <span
                className={cn(
                  "flex items-center gap-1 text-muted-foreground",
                  daysLeft < 30 && "text-amber-600 dark:text-amber-400",
                )}
              >
                <Calendar className="h-3 w-3" />
                {daysLeft < 0 ? "Vencida" : daysLeft === 0 ? "Hoy" : `${daysLeft}d`}
              </span>
            ) : null}
            <Badge variant="outline" className="text-[10px] px-1.5">
              {progress}%
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Goal form (shared add / edit) ─────────────────────────────────────────────

function GoalForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<GoalFormValues>>;
  onSubmit: (v: GoalFormValues) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la meta</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Fondo de emergencia" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="targetAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto objetivo ($)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currentAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto actual ($)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="targetDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha objetivo</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoría</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(CATEGORY_META).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ── Plan insights (collapsible) ───────────────────────────────────────────────

function PlanInsightsPanel({ data }: { data: PlanInsightsData }) {
  const [expanded, setExpanded] = useState(false);
  const recs = data.recommendations ?? [];

  return (
    <Card className="rounded-2xl border-primary/20 bg-primary/5">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div
            className="text-sm text-foreground/80 leading-relaxed flex-1 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: inlineMarkdownToHtml(data.summaryBanner),
            }}
          />
        </div>
        {recs.length > 0 && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {expanded ? "Ocultar sugerencias" : `Ver ${recs.length} sugerencias`}
            </button>
            {expanded && (
              <ul className="space-y-2">
                {recs.map((rec) => (
                  <li key={rec.id} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    <div>
                      <p className="font-medium text-foreground">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rec.description.replace(/\*\*(.*?)\*\*/g, "$1")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface DebtRuleRec {
  key: string;
  familia: string;
  titulo: string;
  descripcion: string;
  accion: string;
  impacto: string;
}
interface DebtRulesResponse {
  enabled: boolean;
  hasData: boolean;
  nivel?: number;
  families?: Array<{ familia: string; label: string; recommendations: DebtRuleRec[] }>;
}

/**
 * Motor de 12 reglas de optimización de deuda (Fase 4): muestra, agrupadas por familia, las
 * acciones concretas que mejoran el score/nivel del usuario, cada una con su impacto.
 */
function DebtRulesPanel() {
  const { data, isLoading } = useQuery<DebtRulesResponse>({
    queryKey: ["/api/debt-rules/recommendations"],
    queryFn: () => apiFetch("/api/debt-rules/recommendations"),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data?.enabled || !data?.hasData || !data.families?.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cómo mejorar tu score y tu salud financiera</h2>
        <p className="text-sm text-muted-foreground">
          Acciones concretas para tu situación actual, priorizadas por impacto.
        </p>
      </div>
      {data.families.map((fam) => (
        <div key={fam.familia} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{fam.label}</h3>
          {fam.recommendations.map((rec) => (
            <Card key={rec.key}>
              <CardContent className="space-y-1.5 p-4">
                <p className="font-medium">{rec.titulo}</p>
                <p className="text-sm text-muted-foreground">{rec.descripcion}</p>
                <p className="text-sm">
                  <span className="font-medium">Qué hacer:</span> {rec.accion}
                </p>
                <p className="text-xs font-medium text-primary">Mejora: {rec.impacto}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Plan() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getFinancialGoals, createFinancialGoal, updateFinancialGoal, deleteFinancialGoal } =
    useApi();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: realGoals, isLoading: loadingGoals } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    enabled: isAuthenticated && !authLoading,
    staleTime: 0,
  });

  const { data: financial } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return null;
      return apiFetch("/api/financial-summary");
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30_000,
  });

  const [planRequested, setPlanRequested] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planData, setPlanData] = useState<PlanInsightsData | null>(null);

  const handleGeneratePlan = async () => {
    setPlanRequested(true);
    setPlanLoading(true);
    try {
      const data = await apiFetch("/api/plan/insights");
      setPlanData(data as PlanInsightsData);
    } catch {
      toast({
        title: "Error",
        description: "No se pudo generar el plan. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setPlanLoading(false);
    }
  };

  // ── Goals state / dialogs ──────────────────────────────────────────────────

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const goals: Goal[] = isAuthenticated ? (realGoals ?? []) : [];

  const addForm = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: "",
      targetAmount: 0,
      currentAmount: 0,
      targetDate: format(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), "yyyy-MM-dd"),
      category: "savings",
    },
  });

  const editForm = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: "",
      targetAmount: 0,
      currentAmount: 0,
      targetDate: "",
      category: "savings",
    },
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: createFinancialGoal,
    onMutate: async (newGoal) => {
      await queryClient.cancelQueries({ queryKey: ["/api/financial-goals"] });
      const prev = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
      if (prev) {
        queryClient.setQueryData<Goal[]>(
          ["/api/financial-goals"],
          [...prev, { id: Date.now(), ...newGoal, createdAt: new Date() }],
        );
      }
      return { prev };
    },
    onSuccess: async (newGoal) => {
      Analytics.goalCreated();
      queryClient.setQueryData<Goal[]>(["/api/financial-goals"], (old) => {
        const list = old ?? [];
        const clean = list.filter((g) => !isOptimisticId(g.id));
        if (!newGoal) return clean;
        const id = Number(newGoal.id);
        return clean.some((g) => Number(g.id) === id)
          ? clean.map((g) => (Number(g.id) === id ? { ...g, ...newGoal } : g))
          : [...clean, newGoal as Goal];
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      setIsAddOpen(false);
      addForm.reset();
      hapticLight();
      toast({ title: "Meta creada" });
    },
    onError: (err, _, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/financial-goals"], ctx.prev);
      toast({ title: "Error", description: mapUserFacingApiError(err), variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: (d: { id: string; goal: UpdateGoalData }) => updateFinancialGoal(d.id, d.goal),
    onMutate: async ({ id, goal }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/financial-goals"] });
      const prev = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
      if (prev) {
        queryClient.setQueryData<Goal[]>(
          ["/api/financial-goals"],
          prev.map((g) => (g.id === Number(id) ? { ...g, ...goal } : g)),
        );
      }
      return { prev };
    },
    onSuccess: async (data) => {
      if (data) {
        queryClient.setQueryData<Goal[]>(["/api/financial-goals"], (old) =>
          (old ?? []).map((g) => (Number(g.id) === Number(data.id) ? { ...g, ...data } : g)),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      setIsEditOpen(false);
      setEditingGoal(null);
      editForm.reset();
      hapticLight();
      toast({ title: "Meta actualizada" });
    },
    onError: (err, _, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/financial-goals"], ctx.prev);
      toast({ title: "Error", description: mapUserFacingApiError(err), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFinancialGoal(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/financial-goals"] });
      const prev = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
      if (prev) {
        queryClient.setQueryData<Goal[]>(
          ["/api/financial-goals"],
          prev.filter((g) => g.id !== Number(id)),
        );
      }
      return { prev };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      hapticLight();
      toast({ title: "Meta eliminada" });
    },
    onError: (err, _, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/financial-goals"], ctx.prev);
      toast({ title: "Error", description: mapUserFacingApiError(err), variant: "destructive" });
    },
  });

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    editForm.reset({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      targetDate: goal.targetDate ? format(new Date(goal.targetDate), "yyyy-MM-dd") : "",
      category: goal.category,
    });
    setIsEditOpen(true);
  };

  const submitAdd = (v: GoalFormValues) => {
    const [y, m, d] = v.targetDate.split("-").map(Number);
    addMutation.mutate({ ...v, targetDate: new Date(y, m - 1, d) });
  };

  const submitEdit = (v: GoalFormValues) => {
    if (!editingGoal) return;
    const [y, m, d] = v.targetDate.split("-").map(Number);
    editMutation.mutate({
      id: String(editingGoal.id),
      goal: { ...v, targetDate: new Date(y, m - 1, d) },
    });
  };

  // ── 50/30/20 calculations ──────────────────────────────────────────────────

  const income = financial?.summary?.monthlyIncome ?? 0;
  const expenses = financial?.summary?.monthlyExpenses ?? 0;
  const savings = Math.max(0, income - expenses);

  // Without categorized data we show total expenses as "needs+wants"
  const needsPct = income > 0 ? pct(expenses * 0.6, income) : 0; // rough split
  const wantsPct = income > 0 ? pct(expenses * 0.4, income) : 0;
  const savingsPct = income > 0 ? pct(savings, income) : 0;

  const hasFinancialData = income > 0;

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (authLoading || (isAuthenticated && loadingGoals && !realGoals)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-60 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {!isAuthenticated && (
          <SignInBanner
            title="Inicia sesión para tu plan personalizado"
            description="El plan 50/30/20 y las metas se calculan con tus datos reales."
            actionText="Iniciar sesión"
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PastelIcon icon={Target} color="indigo" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Plan financiero</h1>
              <p className="text-sm text-muted-foreground">
                {hasFinancialData
                  ? `Ingreso mensual: ${CLP.format(income)}`
                  : "Sube la cartola de la cuenta donde recibes tus ingresos (corriente o vista) para ver tu plan"}
              </p>
            </div>
          </div>
          <Button
            onClick={handleGeneratePlan}
            disabled={planLoading || !isAuthenticated}
            className="gap-2 shrink-0"
            variant={planRequested ? "outline" : "default"}
          >
            {planLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {planLoading ? "Analizando…" : planRequested ? "Actualizar plan" : "Generar plan IA"}
          </Button>
        </div>

        {/* Plan IA insights */}
        {planData && !planLoading && <PlanInsightsPanel data={planData} />}

        {/* Motor de 12 reglas de optimización de deuda (auto-carga si hay datos) */}
        {isAuthenticated && <DebtRulesPanel />}

        {/* ── 50/30/20 Section ─────────────────────────────────────────────── */}
        <Card className="rounded-2xl border-border">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Distribución del ingreso
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Regla 50/30/20 — necesidades / gustos / ahorro
                </p>
              </div>
              {hasFinancialData && (
                <Badge variant="outline" className="text-xs">
                  {CLP.format(income)}/mes
                </Badge>
              )}
            </div>

            {hasFinancialData ? (
              <div className="space-y-5">
                {/* Visual stacked bar */}
                <div className="flex h-5 rounded-full overflow-hidden gap-px">
                  <div
                    className="bg-blue-500 transition-all duration-700"
                    style={{ width: `${Math.min(needsPct, 100)}%` }}
                    title={`Necesidades ${needsPct}%`}
                  />
                  <div
                    className="bg-violet-400 transition-all duration-700"
                    style={{ width: `${Math.min(wantsPct, 100)}%` }}
                    title={`Gustos ${wantsPct}%`}
                  />
                  <div
                    className="bg-emerald-400 transition-all duration-700 flex-1"
                    style={{ minWidth: savingsPct > 0 ? `${Math.min(savingsPct, 100)}%` : "2px" }}
                    title={`Ahorro ${savingsPct}%`}
                  />
                </div>
                {/* Legend */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Necesidades
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block" /> Gustos
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> Ahorro
                  </span>
                </div>

                {/* Detailed bars */}
                <div className="space-y-4 pt-2 border-t border-border">
                  <BudgetBar
                    label="Necesidades (vivienda, comida, transporte)"
                    actual={needsPct}
                    target={50}
                    amount={expenses * 0.6}
                    color="text-blue-600"
                    bgColor="bg-blue-500"
                  />
                  <BudgetBar
                    label="Gustos (ocio, restaurantes, compras)"
                    actual={wantsPct}
                    target={30}
                    amount={expenses * 0.4}
                    color="text-violet-600"
                    bgColor="bg-violet-400"
                  />
                  <BudgetBar
                    label="Ahorro e inversión"
                    actual={savingsPct}
                    target={20}
                    amount={savings}
                    color="text-emerald-600"
                    bgColor="bg-emerald-400"
                  />
                </div>

                {/* Summary chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <div className="rounded-lg border border-border px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">Gastos totales: </span>
                    <span className="font-semibold">{CLP.format(expenses)}</span>
                  </div>
                  <div className="rounded-lg border border-border px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">Ahorro disponible: </span>
                    <span
                      className={cn(
                        "font-semibold",
                        savings > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
                      )}
                    >
                      {CLP.format(savings)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">Tasa de ahorro: </span>
                    <span
                      className={cn(
                        "font-semibold",
                        savingsPct >= 20
                          ? "text-emerald-600 dark:text-emerald-400"
                          : savingsPct >= 10
                            ? "text-amber-600"
                            : "text-red-500",
                      )}
                    >
                      {savingsPct}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground space-y-2">
                <Target className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">No hay datos de ingreso aún</p>
                <p className="text-xs">
                  Sube la cartola de la cuenta donde recibes tus ingresos (corriente o vista) — las
                  tarjetas de crédito solo aportan gastos
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Metas Section ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Metas de ahorro</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {goals.length > 0
                  ? `${goals.filter((g) => g.currentAmount >= g.targetAmount).length} completadas · ${goals.length} total`
                  : "Define cuánto quieres ahorrar y para qué"}
              </p>
            </div>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!isAuthenticated}>
                  <Plus className="h-3.5 w-3.5" />
                  Nueva meta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva meta financiera</DialogTitle>
                </DialogHeader>
                <GoalForm
                  form={addForm}
                  onSubmit={submitAdd}
                  isPending={addMutation.isPending}
                  submitLabel="Crear meta"
                />
              </DialogContent>
            </Dialog>
          </div>

          {loadingGoals && !realGoals ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : goals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onEdit={openEdit}
                  onDelete={(id) => deleteMutation.mutate(id)}
                />
              ))}
            </div>
          ) : isAuthenticated ? (
            <Card className="rounded-2xl border-dashed border-border">
              <CardContent className="py-12 text-center space-y-3">
                <PiggyBank className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
                <p className="text-sm font-medium text-muted-foreground">No tienes metas aún</p>
                <p className="text-xs text-muted-foreground">
                  Crea tu primera meta para empezar a ahorrar con propósito
                </p>
                <Button size="sm" onClick={() => setIsAddOpen(true)} className="mt-2 gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Crear primera meta
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Edit goal dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar meta</DialogTitle>
            </DialogHeader>
            <GoalForm
              form={editForm}
              onSubmit={submitEdit}
              isPending={editMutation.isPending}
              submitLabel="Guardar cambios"
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
