import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { mapUserFacingApiError } from "@/lib/userFacingErrors";
import { Analytics } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
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
  Plus, 
  Pencil, 
  Trash2, 
  Target, 
  PiggyBank, 
  GraduationCap, 
  Home, 
  CreditCard,
  Briefcase,
  MoreHorizontal,
  Calendar,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  DollarSign
} from "lucide-react";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import type { Goal, UpdateGoalData } from "@/types";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";

// Form schema for adding/editing a goal
const goalFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  targetAmount: z.coerce.number().min(1, "El monto objetivo es obligatorio"),
  currentAmount: z.coerce.number().min(0, "El monto actual debe ser 0 o más"),
  targetDate: z.string().min(1, "La fecha objetivo es obligatoria"),
  category: z.enum(["savings", "debt_repayment", "retirement", "home", "education", "other"]),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

/** IDs optimistas en onMutate usan Date.now() (≫ 1e12); los serial de Postgres son mucho menores. */
function isOptimisticGoalId(id: unknown): boolean {
  return typeof id === "number" && id > 10_000_000_000;
}

export default function Goals() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get API functions from useApi
  const { 
    getFinancialGoals, 
    createFinancialGoal, 
    updateFinancialGoal, 
    deleteFinancialGoal 
  } = useApi();

  // Only fetch goals if authenticated and not loading
  const { data: realGoals, isLoading, error } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    enabled: isAuthenticated && !authLoading,
    staleTime: 0, // Ensure we always get fresh data from cache
  });
  
  const goals = isAuthenticated ? realGoals : [];

  // Add goal mutation
  const addGoalMutation = useMutation({
    mutationFn: createFinancialGoal,
    onMutate: async (newGoal) => {
      await queryClient.cancelQueries({ queryKey: ["/api/financial-goals"] });
      
      const previousGoals = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
      
      if (previousGoals) {
        const optimisticGoal: Goal = {
          id: Date.now(), // Temporary ID
          ...newGoal,
          createdAt: new Date(),
        };
        queryClient.setQueryData<Goal[]>(["/api/financial-goals"], [...previousGoals, optimisticGoal]);
      }
      
      return { previousGoals };
    },
    onSuccess: async (newGoal) => {
      Analytics.goalCreated();
      // Sincronizar caché con la fila real del servidor (evita lista vacía o datos viejos tras invalidate).
      queryClient.setQueryData<Goal[]>(["/api/financial-goals"], (old) => {
        const list = old ?? [];
        const withoutTemp = list.filter((g) => !isOptimisticGoalId(g.id));
        if (!newGoal) return withoutTemp;
        const id = Number(newGoal.id);
        const hasId = withoutTemp.some((g) => Number(g.id) === id);
        if (hasId) {
          return withoutTemp.map((g) => (Number(g.id) === id ? { ...g, ...newGoal } : g));
        }
        return [...withoutTemp, newGoal as Goal];
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setIsAddGoalOpen(false);
      addForm.reset();
      hapticLight();
      toast({
        title: "Meta creada",
        description: "Tu meta financiera se ha creado correctamente.",
      });
    },
    onError: (error, newGoal, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["/api/financial-goals"], context.previousGoals);
      }
      toast({
        title: "Error",
        description: mapUserFacingApiError(error),
        variant: "destructive",
      });
    },
  });

  // Edit goal mutation
  const editGoalMutation = useMutation({
    mutationFn: (data: { id: string; goal: UpdateGoalData }) => 
      updateFinancialGoal(data.id, data.goal),
    onMutate: async ({ id, goal }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/financial-goals"] });
      
      const previousGoals = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
      
      if (previousGoals) {
        const updatedGoals = previousGoals.map(existingGoal => 
          existingGoal.id === Number(id) ? {
            ...existingGoal,
            ...goal,
          } : existingGoal
        );
        queryClient.setQueryData<Goal[]>(["/api/financial-goals"], updatedGoals);
      }
      
      return { previousGoals };
    },
    onSuccess: async (data) => {
      if (data) {
        queryClient.setQueryData<Goal[]>(["/api/financial-goals"], (old) => {
          const list = old ?? [];
          return list.map((goal) => (Number(goal.id) === Number(data.id) ? { ...goal, ...data } : goal));
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setIsEditGoalOpen(false);
      setSelectedGoal(null);
      editForm.reset();
      hapticLight();
      toast({
        title: "Meta actualizada",
        description: "Tu meta financiera se ha actualizado correctamente.",
      });
    },
    onError: (error, variables, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["/api/financial-goals"], context.previousGoals);
      }
      toast({
        title: "Error",
        description: mapUserFacingApiError(error),
        variant: "destructive",
      });
    },
  });

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: (goalId: string) => deleteFinancialGoal(goalId),
    onMutate: async (goalId) => {
      await queryClient.cancelQueries({ queryKey: ["/api/financial-goals"] });
      
      const previousGoals = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
      
      if (previousGoals) {
        const filteredGoals = previousGoals.filter(goal => goal.id !== Number(goalId));
        queryClient.setQueryData<Goal[]>(["/api/financial-goals"], filteredGoals);
      }
      
      return { previousGoals };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      hapticLight();
      toast({
        title: "Meta eliminada",
        description: "La meta financiera ha sido eliminada.",
      });
    },
    onError: (error, goalId, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["/api/financial-goals"], context.previousGoals);
      }
      toast({
        title: "Error",
        description: mapUserFacingApiError(error),
        variant: "destructive",
      });
    },
  });

  // Form for adding a new goal
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

  // Form for editing a goal
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

  const handleAddSubmit = (values: GoalFormValues) => {
    // Create a Date object that treats the date as local time, not UTC
    const [year, month, day] = values.targetDate.split('-').map(Number);
    const localDate = new Date(year, month - 1, day); // month is 0-indexed
    
    addGoalMutation.mutate({
      ...values,
      targetDate: localDate,
    });
  };

  const handleEditSubmit = (values: GoalFormValues) => {
    if (selectedGoal) {
      // Create a Date object that treats the date as local time, not UTC
      const [year, month, day] = values.targetDate.split('-').map(Number);
      const localDate = new Date(year, month - 1, day); // month is 0-indexed
      
      editGoalMutation.mutate({
        id: String(selectedGoal.id),
        goal: {
          ...values,
          targetDate: localDate,
        }
      });
    }
  };

  const handleEditGoal = (goal: Goal) => {
    setSelectedGoal(goal);
    editForm.reset({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      targetDate: format(new Date(goal.targetDate), "yyyy-MM-dd"),
      category: goal.category,
    });
    setIsEditGoalOpen(true);
  };

  const handleDeleteGoal = (goalId: string | number) => {
    deleteGoalMutation.mutate(String(goalId));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.round((current / target) * 100);
  };

  const getCategoryIcon = (category: string) => {
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
  };

  const getCategoryColor = (category: string) => {
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
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "savings":
        return "Ahorro";
      case "debt_repayment":
        return "Pago de deudas";
      case "retirement":
        return "Jubilación";
      case "home":
        return "Vivienda";
      case "education":
        return "Educación";
      default:
        return "Otros";
    }
  };

  const getGoalStatus = (goal: Goal) => {
    const progress = calculateProgress(goal.currentAmount, goal.targetAmount);
    const targetDate = new Date(goal.targetDate);
    const daysLeft = differenceInDays(targetDate, new Date());
    
    if (progress >= 100) {
      return { label: '¡Completada!', color: 'bg-green-100 text-green-700', icon: CheckCircle };
    }
    if (daysLeft < 0) {
      return { label: 'Vencida', color: 'bg-red-100 text-red-700', icon: AlertTriangle };
    }
    if (daysLeft < 30) {
      return { label: 'Próxima', color: 'bg-yellow-100 text-yellow-700', icon: Clock };
    }
    return { label: 'En curso', color: 'bg-blue-100 text-blue-700', icon: TrendingUp };
  };

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Error al cargar las metas</h2>
          <p className="text-muted-foreground mb-6">
            {error instanceof Error ? error.message : "Ha ocurrido un error"}
          </p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] })}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const totalTarget = goals?.reduce((sum: number, g: Goal) => sum + g.targetAmount, 0) || 0;
  const totalCurrent = goals?.reduce((sum: number, g: Goal) => sum + g.currentAmount, 0) || 0;
  const overallProgress = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  const completedGoals = goals?.filter((g: Goal) => g.currentAmount >= g.targetAmount).length || 0;
  const activeGoals = (goals?.length || 0) - completedGoals;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner
            title="Inicia sesión para tus metas"
            description="Crea y sigue metas con tus datos reales."
            actionText="Iniciar sesión"
          />
        )}
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <PastelIcon icon={Target} color="green" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Metas financieras</h1>
                <p className="text-sm text-muted-foreground">Sigue tu avance hacia la libertad financiera</p>
              </div>
            </div>
          </div>
          <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2" disabled={!isAuthenticated}>
                <Plus className="h-4 w-4" />
                Añadir meta
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md max-h-modal-viewport scroll-touch-momentum overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Añadir meta financiera</DialogTitle>
              <DialogDescription>
                Crea una nueva meta para seguir tu progreso.
              </DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(handleAddSubmit)} className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la meta</FormLabel>
                      <FormControl>
                        <Input placeholder="ej. Fondo de emergencia" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addForm.control}
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
                    control={addForm.control}
                    name="targetAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto objetivo</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="currentAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto actual</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={addForm.control}
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
                    {addGoalMutation.isPending ? "Creando..." : "Crear meta"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total ahorrado</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(totalCurrent)}</p>
                  <p className="text-xs text-muted-foreground mt-1">de {formatCurrency(totalTarget)} objetivo</p>
                </div>
                <PastelIcon icon={DollarSign} color="green" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Progreso total</p>
                  <p className="text-2xl font-bold mt-1">{overallProgress}%</p>
                  <Progress value={overallProgress} className="h-2 mt-2 w-24" />
                </div>
                <PastelIcon icon={TrendingUp} color="blue" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Metas activas</p>
                  <p className="text-2xl font-bold mt-1">{activeGoals}</p>
                  <p className="text-xs text-muted-foreground mt-1">En progreso</p>
                </div>
                <PastelIcon icon={Target} color="purple" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completadas</p>
                  <p className="text-2xl font-bold mt-1">{completedGoals}</p>
                  <p className="text-xs text-muted-foreground mt-1">Metas alcanzadas</p>
                </div>
                <PastelIcon icon={CheckCircle} color="orange" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Goals Grid */}
        {goals && goals.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal: Goal) => {
              const Icon = getCategoryIcon(goal.category);
              const colorClass = getCategoryColor(goal.category);
              const progress = calculateProgress(goal.currentAmount, goal.targetAmount);
              const status = getGoalStatus(goal);
              const StatusIcon = status.icon;
              const targetDate = new Date(goal.targetDate);
              const daysLeft = differenceInDays(targetDate, new Date());
              
              return (
                <Card key={goal.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <div className={cn("h-1", colorClass)} />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl text-white", colorClass)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{goal.name}</CardTitle>
                          <CardDescription>{getCategoryLabel(goal.category)}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className={cn("text-xs", status.color)}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progreso</span>
                        <span className="font-semibold">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                    
                    {/* Amounts */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Actual</p>
                        <p className="text-lg font-bold">{formatCurrency(goal.currentAmount)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Objetivo</p>
                        <p className="text-lg font-bold">{formatCurrency(goal.targetAmount)}</p>
                      </div>
                    </div>
                    
                    {/* Target Date */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{format(targetDate, "MMM dd, yyyy")}</span>
                      </div>
                      <span className={cn(
                        "font-medium",
                        daysLeft < 0 ? "text-red-600" : 
                        daysLeft < 30 ? "text-yellow-600" : 
                        "text-muted-foreground"
                      )}>
                        {daysLeft < 0 ? `${Math.abs(daysLeft)} días de retraso` :
                         daysLeft === 0 ? "Vence hoy" :
                         `${daysLeft} días restantes`}
                      </span>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEditGoal(goal)}
                        disabled={!isAuthenticated}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            disabled={!isAuthenticated}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar meta</AlertDialogTitle>
                            <AlertDialogDescription>
                              ¿Estás seguro de que quieres eliminar &quot;{goal.name}&quot;? Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteGoal(goal.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Target className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Define tu primera meta</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Comienza tu camino hacia la libertad financiera creando una meta SMART: 
                Específica, Medible, Alcanzable, Relevante y con plazos.
              </p>
              <Button onClick={() => setIsAddGoalOpen(true)} disabled={!isAuthenticated} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Crear tu primera meta
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Edit Goal Dialog */}
      <Dialog open={isEditGoalOpen} onOpenChange={setIsEditGoalOpen}>
        <DialogContent className="max-w-md max-h-modal-viewport scroll-touch-momentum overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar meta financiera</DialogTitle>
            <DialogDescription>
              Actualiza los datos de tu meta financiera.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la meta</FormLabel>
                    <FormControl>
                      <Input placeholder="ej. Fondo de emergencia" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
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
                  control={editForm.control}
                  name="targetAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto objetivo</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="currentAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto actual</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
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
                <Button type="button" variant="outline" onClick={() => setIsEditGoalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editGoalMutation.isPending}>
                  {editGoalMutation.isPending ? "Guardando..." : "Actualizar meta"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}