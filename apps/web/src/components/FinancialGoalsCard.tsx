import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFinancialGoals } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Target,
  PiggyBank,
  Home,
  GraduationCap,
  CreditCard,
  Briefcase,
  ChevronRight,
  Calendar,
  TrendingUp,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Define the interface for a financial goal
interface FinancialGoal {
  id: number;
  userId: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date | string;
  category: string;
  status: string;
  createdAt?: Date;
}

// Form schema for adding/editing a goal
const goalFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  targetAmount: z.coerce.number().min(1, "El monto objetivo es obligatorio"),
  currentAmount: z.coerce.number().min(0, "El monto actual debe ser 0 o más"),
  targetDate: z.string().min(1, "La fecha objetivo es obligatoria"),
  category: z.enum(["savings", "debt_repayment", "retirement", "home", "education", "other"]),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

// Get icon for category
function getCategoryIcon(category: string) {
  switch (category) {
    case "savings":
      return PiggyBank;
    case "debt_repayment":
      return CreditCard;
    case "retirement":
      return Briefcase;
    case "home":
      return Home;
    case "education":
      return GraduationCap;
    default:
      return Target;
  }
}

// Get color for category
function getCategoryColor(category: string) {
  switch (category) {
    case "savings":
      return "bg-green-500";
    case "debt_repayment":
      return "bg-red-500";
    case "retirement":
      return "bg-purple-500";
    case "home":
      return "bg-blue-500";
    case "education":
      return "bg-orange-500";
    default:
      return "bg-gray-500";
  }
}

function GoalItem({ goal }: { goal: FinancialGoal }) {
  const { currency } = useCurrency();
  const progress = Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100);
  const Icon = getCategoryIcon(goal.category);
  const colorClass = getCategoryColor(goal.category);

  const remaining = goal.targetAmount - goal.currentAmount;
  const targetDate = new Date(goal.targetDate);
  const isOverdue = targetDate < new Date() && progress < 100;

  return (
    <div className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg text-white", colorClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium truncate">{goal.name}</p>
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                progress >= 100
                  ? "bg-green-100 text-green-700"
                  : isOverdue
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700",
              )}
            >
              {progress >= 100 ? "¡Completada!" : isOverdue ? "Vencida" : `${progress}%`}
            </Badge>
          </div>

          <Progress value={progress} className="h-2 mb-2" />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatCurrency(goal.currentAmount, currency)} de{" "}
              {formatCurrency(goal.targetAmount, currency)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(targetDate, "MMM yyyy")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinancialGoalsCard() {
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const { toast } = useToast();
  const { getFinancialGoals, createFinancialGoal } = useFinancialGoals();

  const {
    data: goals,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
  });

  // Add goal mutation
  const addGoalMutation = useMutation({
    mutationFn: createFinancialGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      setIsAddGoalOpen(false);
      form.reset();
      toast({
        title: "Meta creada",
        description: "Tu meta financiera se ha creado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear la meta",
        variant: "destructive",
      });
    },
  });

  // Form for adding a new goal
  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: "",
      targetAmount: 0,
      currentAmount: 0,
      targetDate: format(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), "yyyy-MM-dd"),
      category: "savings",
    },
  });

  const onSubmit = (values: GoalFormValues) => {
    addGoalMutation.mutate({
      ...values,
      targetDate: new Date(values.targetDate),
    });
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
          <Skeleton className="h-10 w-full mt-4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Metas financieras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Info className="h-6 w-6 text-red-600" />
            </div>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Error al cargar las metas financieras"}
            </p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] })}
            >
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total progress
  const totalTarget =
    goals?.reduce((sum: number, g: FinancialGoal) => sum + g.targetAmount, 0) || 0;
  const totalCurrent =
    goals?.reduce((sum: number, g: FinancialGoal) => sum + g.currentAmount, 0) || 0;
  const overallProgress = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Metas financieras
          </CardTitle>
          <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Añadir
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Añadir meta financiera</DialogTitle>
                <DialogDescription>
                  Define una nueva meta para seguir tu progreso.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la meta</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. Fondo de emergencia" {...field} />
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
                              <SelectValue placeholder="Elegir categoría" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="savings">Ahorro</SelectItem>
                            <SelectItem value="debt_repayment">Pago de deudas</SelectItem>
                            <SelectItem value="retirement">Jubilación</SelectItem>
                            <SelectItem value="home">Vivienda</SelectItem>
                            <SelectItem value="education">Educación</SelectItem>
                            <SelectItem value="other">Otros</SelectItem>
                          </SelectContent>
                        </Select>
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
                            <Input type="number" min="0" step="100" {...field} />
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
                            <Input type="number" min="0" step="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddGoalOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={addGoalMutation.isPending}>
                      {addGoalMutation.isPending ? "Añadiendo..." : "Añadir meta"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>Sigue tu avance hacia tus hitos financieros</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        {/* Overall Progress Summary */}
        {goals && goals.length > 0 && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progreso total</span>
              <span className="text-sm font-bold text-primary">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              Vas bien con {goals.length} meta{goals.length !== 1 ? "s" : ""} activa
              {goals.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Goals List */}
        <div className="space-y-2 flex-1 overflow-auto">
          {goals && goals.length > 0 ? (
            goals.slice(0, 3).map((goal: FinancialGoal) => <GoalItem key={goal.id} goal={goal} />)
          ) : (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Target className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                Aún no hay metas. Empieza a seguir tus hitos financieros.
              </p>
            </div>
          )}
        </div>

        {/* View All Button */}
        <Link href={ROUTES.metas}>
          <Button className="w-full mt-4 group">
            <Target className="h-4 w-4 mr-2" />
            {goals && goals.length > 3 ? `Ver las ${goals.length} metas` : "Gestionar metas"}
            <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
