import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Tag, 
  Calendar, 
  DollarSign,
  Receipt,
  Filter,
  TrendingDown,
  Sparkles,
  ShoppingBag,
  Utensils,
  Car,
  Home,
  Heart,
  Clapperboard,
  ShoppingCart,
  Zap,
  GraduationCap,
  Plane,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useApi } from "@/lib/api";
import type { Expense } from "@/types";
import { useAuth } from "@/lib/auth";
import { generateDemoExpenses } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Helper to parse tags that might be a JSON string or already an array
function parseTags(tags: string | string[] | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // If it's not valid JSON, treat as comma-separated
      return tags.split(',').map(t => t.trim()).filter(Boolean);
    }
  }
  return [];
}

const expenseFormSchema = z.object({
  amount: z.string().min(1, "El monto es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  category: z.string().min(1, "La categoría es obligatoria"),
  subcategory: z.string().optional(),
  merchantName: z.string().optional(),
  date: z.string().min(1, "La fecha es obligatoria"),
  paymentMethod: z.string().optional(),
  isRecurring: z.boolean().default(false),
  tags: z.string().optional(),
  notes: z.string().optional(),
  isAutoClassified: z.boolean().default(true),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

const categories = [
  "Groceries", "Dining", "Transportation", "Housing", "Healthcare",
  "Entertainment", "Shopping", "Utilities", "Education", "Travel", "Other"
];

const categoryLabels: Record<string, string> = {
  Groceries: "Supermercado",
  Dining: "Restaurantes",
  Transportation: "Transporte",
  Housing: "Vivienda",
  Healthcare: "Salud",
  Entertainment: "Entretenimiento",
  Shopping: "Compras",
  Utilities: "Servicios",
  Education: "Educación",
  Travel: "Viajes",
  Other: "Otros",
};

// Get icon for category
function getCategoryIcon(category: string) {
  switch (category.toLowerCase()) {
    case 'groceries': return ShoppingCart;
    case 'dining': return Utensils;
    case 'transportation': return Car;
    case 'housing': return Home;
    case 'healthcare': return Heart;
    case 'entertainment': return Clapperboard;
    case 'shopping': return ShoppingBag;
    case 'utilities': return Zap;
    case 'education': return GraduationCap;
    case 'travel': return Plane;
    default: return MoreHorizontal;
  }
}

// Get color for category
function getCategoryColor(category: string) {
  switch (category.toLowerCase()) {
    case 'groceries': return 'bg-green-500';
    case 'dining': return 'bg-orange-500';
    case 'transportation': return 'bg-blue-500';
    case 'housing': return 'bg-purple-500';
    case 'healthcare': return 'bg-red-500';
    case 'entertainment': return 'bg-pink-500';
    case 'shopping': return 'bg-yellow-500';
    case 'utilities': return 'bg-cyan-500';
    case 'education': return 'bg-indigo-500';
    case 'travel': return 'bg-teal-500';
    default: return 'bg-gray-500';
  }
}

// Stat Card Component
function StatCard({ 
  title, 
  value, 
  subtext, 
  icon: Icon, 
  color,
  trend
}: { 
  title: string;
  value: string;
  subtext?: string;
  icon: any;
  color: string;
  trend?: { value: string; type: 'up' | 'down' | 'neutral' };
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-sm mt-1",
                trend.type === 'up' && "text-red-600",
                trend.type === 'down' && "text-green-600",
                trend.type === 'neutral' && "text-muted-foreground"
              )}>
                {trend.type === 'up' && <ArrowUpRight className="h-4 w-4" />}
                {trend.type === 'down' && <ArrowDownRight className="h-4 w-4" />}
                <span>{trend.value}</span>
              </div>
            )}
            {subtext && !trend && (
              <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
          <div className={cn("p-3 rounded-xl", color)}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Expenses() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { getExpenses, createExpense, updateExpense, deleteExpense, classifyExpense } = useApi();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Use demo data when not authenticated, real data when authenticated
  const demoExpenses = generateDemoExpenses();
  
  const { data: realExpenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    queryFn: getExpenses,
    enabled: isAuthenticated && !authLoading,
    staleTime: 0, // Ensure we always get fresh data from cache
  });

  const expenses = isAuthenticated ? realExpenses : demoExpenses;

  const createExpenseMutation = useMutation({
    mutationFn: (expense: ExpenseFormValues) => 
      createExpense({
        ...expense,
        amount: parseFloat(expense.amount),
        date: new Date(expense.date),
        tags: expense.tags ? expense.tags.split(",").map(t => t.trim()) : [],
      }),
    onSuccess: (data) => {
      // Immediately update the cache with the real data from server
      const previousExpenses = queryClient.getQueryData<Expense[]>(["/api/expenses"]);
      if (previousExpenses && data) {
        queryClient.setQueryData<Expense[]>(["/api/expenses"], [...previousExpenses, data]);
      }
      
      // Also invalidate to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      // Invalidate notifications to show new expense notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Gasto añadido",
        description: "El gasto se ha registrado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo añadir el gasto",
        variant: "destructive",
      });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: (data: { id: number; expense: ExpenseFormValues }) => 
      updateExpense(data.id.toString(), {
        ...data.expense,
        amount: parseFloat(data.expense.amount),
        date: new Date(data.expense.date),
        tags: data.expense.tags ? data.expense.tags.split(",").map(t => t.trim()) : [],
      }),
    onMutate: async ({ id, expense }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/expenses"] });
      
      const previousExpenses = queryClient.getQueryData<Expense[]>(["/api/expenses"]);
      
      if (previousExpenses) {
        const updatedExpenses = previousExpenses.map(exp => {
          if (exp.id === Number(id)) {
            return {
              ...exp,
              amount: parseFloat(expense.amount).toString(), // Ensure it's a valid number then convert to string
              description: expense.description,
              category: expense.category,
              subcategory: expense.subcategory || null,
              merchantName: expense.merchantName || null,
              // Create a Date object that treats the date as local time, not UTC
              date: (() => {
                const [year, month, day] = expense.date.split('-').map(Number);
                return new Date(year, month - 1, day); // month is 0-indexed
              })(),
              paymentMethod: expense.paymentMethod || null,
              isRecurring: expense.isRecurring || false,
              tags: expense.tags ? expense.tags.split(",").map(t => t.trim()) : null,
              notes: expense.notes || null,
              isAutoClassified: expense.isAutoClassified || true,
            };
          }
          return exp;
        });
        queryClient.setQueryData<Expense[]>(["/api/expenses"], updatedExpenses);
      }
      
      return { previousExpenses };
    },
    onSuccess: (data) => {
      // Update the cache with the real data from server
      if (data) {
        const previousExpenses = queryClient.getQueryData<Expense[]>(["/api/expenses"]);
        if (previousExpenses) {
          const updatedExpenses = previousExpenses.map(exp => 
            exp.id === data.id ? data : exp
          );
          queryClient.setQueryData<Expense[]>(["/api/expenses"], updatedExpenses);
        }
      }
      setIsEditDialogOpen(false);
      setSelectedExpense(null);
      editForm.reset();
      toast({
        title: "Gasto actualizado",
        description: "El gasto se ha actualizado correctamente.",
      });
    },
    onError: (error, variables, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(["/api/expenses"], context.previousExpenses);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo actualizar el gasto",
        variant: "destructive",
      });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => deleteExpense(id.toString()),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/expenses"] });
      
      const previousExpenses = queryClient.getQueryData<Expense[]>(["/api/expenses"]);
      
      if (previousExpenses) {
        const filteredExpenses = previousExpenses.filter(expense => expense.id !== Number(id));
        queryClient.setQueryData<Expense[]>(["/api/expenses"], filteredExpenses);
      }
      
      return { previousExpenses };
    },
    onSuccess: () => {
      // Don't invalidate - the optimistic update already removed it
      toast({
        title: "Gasto eliminado",
        description: "El gasto se ha eliminado correctamente.",
      });
    },
    onError: (error, id, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(["/api/expenses"], context.previousExpenses);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el gasto",
        variant: "destructive",
      });
    },
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: "",
      description: "",
      category: "",
      subcategory: "",
      merchantName: "",
      date: new Date().toISOString().split('T')[0],
      paymentMethod: "",
      isRecurring: false,
      tags: "",
      notes: "",
      isAutoClassified: true,
    },
  });

  const editForm = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: "",
      description: "",
      category: "",
      subcategory: "",
      merchantName: "",
      date: new Date().toISOString().split('T')[0],
      paymentMethod: "",
      isRecurring: false,
      tags: "",
      notes: "",
      isAutoClassified: true,
    },
  });

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         expense.merchantName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || expense.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  // AI Classification function with debouncing
  const classifyExpenseAI = async (description: string, merchantName?: string, amount?: string, targetForm?: 'add' | 'edit') => {
    if (!isAuthenticated || !description.trim()) {
      return;
    }

    const currentForm = targetForm === 'edit' ? editForm : form;
    const isAutoClassifyEnabled = targetForm === 'edit' ? editForm.watch('isAutoClassified') : form.watch('isAutoClassified');

    if (!isAutoClassifyEnabled) {
      return;
    }

    setIsClassifying(true);
    try {
      const result = await classifyExpense(
        description,
        merchantName,
        amount ? parseFloat(amount) : undefined
      );
      
      if (result.confidence >= 0.7) {
        currentForm.setValue('category', result.category);
        if (result.subcategory) {
          currentForm.setValue('subcategory', result.subcategory);
        }
        toast({
          title: "Clasificación con IA",
          description: `Categorizado como "${categoryLabels[result.category] || result.category}" con ${Math.round(result.confidence * 100)}% de confianza`,
        });
      }
    } catch (error) {
      console.error('AI classification failed:', error);
    } finally {
      setIsClassifying(false);
    }
  };

  // Debounced classification
  const [classificationTimeout, setClassificationTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const debouncedClassify = (description: string, merchantName?: string, amount?: string, targetForm?: 'add' | 'edit') => {
    if (classificationTimeout) {
      clearTimeout(classificationTimeout);
    }
    
    const timeout = setTimeout(() => {
      classifyExpenseAI(description, merchantName, amount, targetForm);
    }, 1000); // 1 second delay
    
    setClassificationTimeout(timeout);
  };

  const onSubmit = (values: ExpenseFormValues) => {
    createExpenseMutation.mutate(values);
  };

  const onEditSubmit = (values: ExpenseFormValues) => {
    if (selectedExpense) {
      updateExpenseMutation.mutate({ id: Number(selectedExpense.id), expense: values });
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    const expenseDate = new Date(expense.date);
    const formattedDate = expenseDate.toISOString().split('T')[0];
    
    editForm.reset({
      amount: expense.amount.toString(),
      description: expense.description,
      category: expense.category,
      subcategory: expense.subcategory || "",
      merchantName: expense.merchantName || "",
      date: formattedDate,
      paymentMethod: expense.paymentMethod || "",
      isRecurring: expense.isRecurring || false,
      tags: parseTags(expense.tags).join(", "),
      notes: expense.notes || "",
      isAutoClassified: expense.isAutoClassified || false,
    });
    setIsEditDialogOpen(true);
  };

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container py-8 space-y-6">
          <div className="h-8 bg-muted rounded animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calculate some stats
  const thisMonth = new Date();
  const thisMonthExpenses = expenses.filter(e => {
    const expDate = new Date(e.date);
    return expDate.getMonth() === thisMonth.getMonth() && 
           expDate.getFullYear() === thisMonth.getFullYear();
  });
  const thisMonthTotal = thisMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const avgPerDay = thisMonthTotal / new Date().getDate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner 
            title="Viendo datos de gastos de demostración"
            description="Estás viendo datos de ejemplo para explorar las funciones. Inicia sesión para registrar tus gastos reales, añadir transacciones y sincronizar con tus cuentas bancarias."
            actionText="Iniciar sesión para registrar gastos reales"
          />
        )}
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Gastos</h1>
                <p className="text-muted-foreground">Registra y categoriza tus gastos</p>
              </div>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!isAuthenticated} size="lg" className="gap-2">
                <Plus className="w-4 h-4" />
                Añadir gasto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Añadir nuevo gasto</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto</FormLabel>
                        <FormControl>
                          <Input placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="¿Qué compraste?" 
                            {...field} 
                            onChange={(e) => {
                              field.onChange(e);
                              if (form.watch('isAutoClassified')) {
                              debouncedClassify(
                                e.target.value,
                                form.watch('merchantName'),
                                form.watch('amount'),
                                'add'
                              );
                              }
                            }}
                          />
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
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {categoryLabels[category]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="merchantName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comercio (opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Nombre del local o negocio" 
                          {...field} 
                          onChange={(e) => {
                            field.onChange(e);
                            if (form.watch('isAutoClassified')) {
                            debouncedClassify(
                              form.watch('description'),
                              e.target.value,
                              form.watch('amount'),
                              'add'
                            );
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="vacaciones, trabajo, regalo (separados por coma)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isAutoClassified"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          Auto-clasificar
                          {isClassifying && <Sparkles className="h-4 w-4 animate-pulse text-primary" />}
                        </FormLabel>
                        <div className="text-sm text-gray-500">
                          {isClassifying ? "La IA está analizando..." : "Deja que la IA categorice este gasto"}
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked && form.watch('description')) {
                            debouncedClassify(
                              form.watch('description'),
                              form.watch('merchantName'),
                              form.watch('amount'),
                              'add'
                            );
                            }
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createExpenseMutation.isPending}
                >
                  {createExpenseMutation.isPending ? "Añadiendo..." : "Añadir gasto"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total este mes"
            value={`$${thisMonthTotal.toFixed(2)}`}
            trend={{ value: '12% vs mes anterior', type: 'up' }}
            icon={DollarSign}
            color="bg-green-500"
          />
          <StatCard
            title="Promedio diario"
            value={`$${avgPerDay.toFixed(2)}`}
            subtext="Según este mes"
            icon={TrendingDown}
            color="bg-blue-500"
          />
          <StatCard
            title="Categorías"
            value={new Set(expenses.map(e => e.category)).size.toString()}
            subtext="Categorías activas"
            icon={Tag}
            color="bg-purple-500"
          />
          <StatCard
            title="Transacciones"
            value={filteredExpenses.length.toString()}
            subtext={`${thisMonthExpenses.length} este mes`}
            icon={Receipt}
            color="bg-orange-500"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar gastos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {categoryLabels[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Expenses List */}
        <div className="space-y-3">
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((expense) => {
              const Icon = getCategoryIcon(expense.category);
              const colorClass = getCategoryColor(expense.category);
              
              return (
                <Card key={expense.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="flex items-center">
                      {/* Category Color Bar */}
                      <div className={cn("w-1 self-stretch", colorClass)} />
                      
                      <div className="flex items-center gap-4 p-4 flex-1">
                        {/* Icon */}
                        <div className={cn("p-3 rounded-xl text-white", colorClass)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        
                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{expense.description}</h3>
                            {expense.isAutoClassified && (
                              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                                <Sparkles className="h-3 w-3 mr-1" />
                                AI
                              </Badge>
                            )}
                            {expense.isRecurring && (
                              <Badge variant="outline" className="text-xs">
                                Recurrente
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {categoryLabels[expense.category] || expense.category}
                            </span>
                            {expense.merchantName && (
                              <span className="truncate">{expense.merchantName}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(expense.date).toLocaleDateString()}
                            </span>
                          </div>
                          {parseTags(expense.tags).length > 0 && (
                            <div className="flex items-center gap-1 mt-2">
                              {parseTags(expense.tags).slice(0, 3).map((tag, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {parseTags(expense.tags).length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{parseTags(expense.tags).length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Amount and Actions */}
                        <div className="text-right flex items-center gap-4">
                                          <p className="text-xl font-bold">${Number(expense.amount).toFixed(2)}</p>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditExpense(expense)}
                              disabled={!isAuthenticated}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteExpenseMutation.mutate(Number(expense.id) as any)}
                              disabled={deleteExpenseMutation.isPending || !isAuthenticated}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No se encontraron gastos</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || selectedCategory !== 'all' 
                    ? 'Prueba a ajustar los filtros'
                    : '¡Añade tu primer gasto para comenzar!'}
                </p>
                {!searchTerm && selectedCategory === 'all' && (
                  <Button onClick={() => setIsAddDialogOpen(true)} disabled={!isAuthenticated}>
                    <Plus className="w-4 h-4 mr-2" />
                    Añadir gasto
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <Input placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="¿Qué compraste?" 
                        {...field} 
                        onChange={(e) => {
                          field.onChange(e);
                          if (editForm.watch('isAutoClassified')) {
                            debouncedClassify(
                              e.target.value,
                              editForm.watch('merchantName'),
                              editForm.watch('amount'),
                              'edit'
                            );
                          }
                        }}
                      />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegir categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="merchantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comercio (opcional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Nombre del local o negocio" 
                        {...field} 
                        onChange={(e) => {
                          field.onChange(e);
                          if (editForm.watch('isAutoClassified')) {
                            debouncedClassify(
                              editForm.watch('description'),
                              e.target.value,
                              editForm.watch('amount'),
                              'edit'
                            );
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="vacaciones, trabajo, regalo (separados por coma)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="isAutoClassified"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base flex items-center gap-2">
                        Auto-classify
                        {isClassifying && <Sparkles className="h-4 w-4 animate-pulse text-primary" />}
                      </FormLabel>
                      <div className="text-sm text-gray-500">
                        {isClassifying ? "AI is analyzing..." : "Let AI categorize this expense"}
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked && editForm.watch('description')) {
                            debouncedClassify(
                              editForm.watch('description'),
                              editForm.watch('merchantName'),
                              editForm.watch('amount'),
                              'edit'
                            );
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={updateExpenseMutation.isPending}
                >
                  {updateExpenseMutation.isPending ? "Guardando..." : "Actualizar gasto"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
