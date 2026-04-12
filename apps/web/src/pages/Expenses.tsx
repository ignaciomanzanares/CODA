import { useState, useRef } from "react";
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
  ArrowDownRight,
  FileText,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useApi, API_URL } from "@/lib/api";
import { mapUserFacingApiError } from "@/lib/userFacingErrors";
import SwipeableListRow from "@/components/SwipeableListRow";
import ConfirmDestructiveDialog from "@/components/ConfirmDestructiveDialog";
import { hapticLight } from "@/lib/haptics";
import { Analytics } from "@/lib/analytics";
import type { Expense } from "@/types";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import ParsedTransactionsTable from "@/components/ParsedTransactionsTable";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, inputAmountToStoredClp, storedClpToDisplayAmount } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { AddExpenseFormLite } from "@/components/AddExpenseFormLite";
import type { AddExpenseFormLiteValues } from "@/components/AddExpenseFormLite";

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
  name: z.string().max(200).optional().or(z.literal("")),
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
  groceries: "Supermercado",
  Dining: "Restaurantes",
  dining: "Restaurantes",
  Transportation: "Transporte",
  transportation: "Transporte",
  Housing: "Vivienda",
  housing: "Vivienda",
  Healthcare: "Salud",
  healthcare: "Salud",
  Entertainment: "Entretenimiento",
  entertainment: "Entretenimiento",
  Shopping: "Compras",
  shopping: "Compras",
  Utilities: "Servicios",
  utilities: "Servicios",
  Education: "Educación",
  education: "Educación",
  Travel: "Viajes",
  travel: "Viajes",
  Other: "Otros",
  other: "Otros",
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
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-card-value font-bold mt-1 truncate">{value}</p>
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
  const { getExpenses, createExpense, updateExpense, deleteExpense, classifyExpense, scanExpense, parseNotifications } = useApi();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("auto");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [scanPreFill, setScanPreFill] = useState<{ amount: number; category: string; merchant: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanSuccessMessageRef = useRef<string | null>(null);

  // Notification parser state
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);
  const [notificationText, setNotificationText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedNotifications, setParsedNotifications] = useState<Array<{
    original: string;
    parsed: { amount: number; merchant: string; date: string; cardType: string; bank: string; category: string; sfaCode: string; confidence: number } | null;
    error?: string;
  }> | null>(null);

  // Cartola upload state
  const [isUploadingCartolas, setIsUploadingCartolas] = useState(false);
  const cartolaInputRef = useRef<HTMLInputElement>(null);

  // Build absolute API URL — in production VITE_API_URL = "https://coda-api.onrender.com"
  // Raw fetch("/api/...") hits Vercel (static host) and gets 405; must prefix with the backend base.
  const apiBase = (API_URL || "").replace(/\/$/, "");
  const apiUrl = (path: string) => (apiBase ? `${apiBase}${path}` : path);

  const handleCartolaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !isAuthenticated) return;
    setIsUploadingCartolas(true);
    let successCount = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const token = localStorage.getItem("jwt_token") ?? "";
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(apiUrl("/api/documents/parse-cartola"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) {
          successCount++;
        } else {
          const body = await res.json().catch(() => ({}));
          errors.push(body.message ?? `Error ${res.status} en ${file.name}`);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error en ${file.name}`);
      }
    }
    setIsUploadingCartolas(false);
    if (successCount > 0) {
      queryClient.removeQueries({ queryKey: ["/api/transactions/parsed"] });
      queryClient.removeQueries({ queryKey: ["/api/transactions/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast({
        title: `${successCount} cartola${successCount !== 1 ? "s" : ""} procesada${successCount !== 1 ? "s" : ""}`,
        description: errors.length > 0 ? `${errors[0]}` : "Tus movimientos ya están disponibles en la tabla.",
      });
    } else {
      toast({
        title: "Error al subir",
        description: errors[0] ?? "No se pudo procesar ninguna cartola.",
        variant: "destructive",
      });
    }
  };

  const handleLimpiarCartolas = async () => {
    if (!confirm("¿Borrar todas las cartolas? Esta acción no se puede deshacer.")) return;
    try {
      const token = localStorage.getItem("jwt_token") ?? "";
      const res = await fetch(apiUrl("/api/user/cartolas"), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      queryClient.removeQueries({ queryKey: ["/api/transactions/parsed"] });
      queryClient.removeQueries({ queryKey: ["/api/transactions/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast({ title: "Cartolas eliminadas", description: "Puedes subir nuevas cartolas cuando quieras." });
    } catch (err) {
      toast({
        title: "Error al limpiar",
        description: err instanceof Error ? err.message : "No se pudieron eliminar las cartolas.",
        variant: "destructive",
      });
    }
  };
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currency } = useCurrency();
  // Montos guardados en CLP; mostrar en la moneda elegida (CLP por defecto)
  const formatCurrencyFn = (value: number) => formatCurrency(value, currency, { sourceCurrency: "CLP" });

  const { data: realExpenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    queryFn: getExpenses,
    enabled: isAuthenticated && !authLoading,
    staleTime: 0, // Ensure we always get fresh data from cache
  });

  const expenses = isAuthenticated ? realExpenses : [];

  const createExpenseMutation = useMutation({
    mutationFn: (expense: ExpenseFormValues) => {
      const amountClp = inputAmountToStoredClp(parseFloat(expense.amount), currency);
      return createExpense({
        ...expense,
        amount: amountClp,
        date: new Date(expense.date),
        tags: expense.tags ? expense.tags.split(",").map(t => t.trim()) : [],
      });
    },
    onSuccess: async (data) => {
      hapticLight();
      Analytics.expenseAdded(
        typeof data?.category === "string" && data.category ? data.category : "unknown"
      );
      if (data) {
        queryClient.setQueryData<Expense[]>(["/api/expenses"], (old) => [...(old ?? []), data]);
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setIsAddDialogOpen(false);
      setScanPreFill(null);
      form.reset();
      if (scanSuccessMessageRef.current) {
        toast({ title: "Gasto añadido", description: scanSuccessMessageRef.current });
        scanSuccessMessageRef.current = null;
      } else {
        toast({ title: "Gasto añadido", description: "El gasto se ha registrado correctamente." });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: mapUserFacingApiError(error),
        variant: "destructive",
      });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: (data: { id: number; expense: ExpenseFormValues }) => {
      const amountClp = inputAmountToStoredClp(parseFloat(data.expense.amount), currency);
      return updateExpense(data.id.toString(), {
        ...data.expense,
        amount: amountClp,
        date: new Date(data.expense.date),
        tags: data.expense.tags ? data.expense.tags.split(",").map(t => t.trim()) : [],
      });
    },
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
    onSuccess: async (data) => {
      hapticLight();
      if (data) {
        queryClient.setQueryData<Expense[]>(["/api/expenses"], (old) => {
          const list = old ?? [];
          return list.map((exp) => (exp.id === data.id ? data : exp));
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
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
        description: mapUserFacingApiError(error),
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
    onSuccess: async () => {
      hapticLight();
      await queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
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
        description: mapUserFacingApiError(error),
        variant: "destructive",
      });
    },
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      name: "",
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
      name: "",
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

  const getYearMonth = (dateStr: string | Date): { y: number; m: number } | null => {
    const s = String(dateStr);
    const m1 = s.match(/^(\d{4})-(\d{2})/);
    if (m1) return { y: parseInt(m1[1], 10), m: parseInt(m1[2], 10) - 1 };
    const m2 = s.match(/\/(\d{2})\/(\d{4})$/);
    if (m2) return { y: parseInt(m2[2], 10), m: parseInt(m2[1], 10) - 1 };
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    return null;
  };

  const availableMonths = (() => {
    const keys = new Set<string>();
    for (const e of expenses) {
      const ym = getYearMonth(e.date);
      if (ym) keys.add(`${ym.y}-${String(ym.m + 1).padStart(2, '0')}`);
    }
    return [...keys].sort().reverse();
  })();

  const filteredExpenses = expenses.filter(expense => {
    const name = (expense as Expense & { name?: string }).name?.toLowerCase() || "";
    const matchesSearch = !searchTerm ||
      expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.merchantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      name.includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || expense.category?.toLowerCase() === selectedCategory?.toLowerCase();
    const matchesMonth = selectedMonth === "auto" || (() => {
      const ym = getYearMonth(expense.date);
      if (!ym) return true;
      const key = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
      return key === selectedMonth;
    })();
    return matchesSearch && matchesCategory && matchesMonth;
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
  const [classificationTimeout, setClassificationTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  
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
      // Keep description and date from original expense since they're not in the simplified form
      const updatedExpense = {
        ...values,
        description: selectedExpense.description, // Keep original description
        date: new Date(selectedExpense.date).toISOString().split('T')[0], // Keep original date
      };
      updateExpenseMutation.mutate({ id: Number(selectedExpense.id), expense: updatedExpense });
    }
  };

  const confirmDeleteExpense = () => {
    const e = expensePendingDelete;
    setExpensePendingDelete(null);
    if (e && isAuthenticated) {
      deleteExpenseMutation.mutate(Number(e.id));
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    const expenseDate = new Date(expense.date);
    const formattedDate = expenseDate.toISOString().split('T')[0];
    
    editForm.reset({
      name: (expense as Expense & { name?: string }).name || "",
      amount: storedClpToDisplayAmount(Number(expense.amount), currency).toString(),
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

  const todayIso = () => new Date().toISOString().split("T")[0];

  const onLiteSubmit = (values: AddExpenseFormLiteValues) => {
    createExpenseMutation.mutate({
      name: values.name?.trim() || undefined,
      amount: values.amount,
      description: scanPreFill?.merchant || "Gasto rápido",
      category: values.category,
      date: todayIso(),
      subcategory: "",
      merchantName: scanPreFill?.merchant || "",
      paymentMethod: "",
      isRecurring: false,
      tags: "",
      notes: "",
      isAutoClassified: false,
    });
  };

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAuthenticated) return;
    e.target.value = "";
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Formato no válido", description: "Usa una imagen JPG o PNG.", variant: "destructive" });
      return;
    }
    setIsScanning(true);
    try {
      const result = await scanExpense(file);
      if (result.confidence > 0.9) {
        scanSuccessMessageRef.current = `Gasto de $${result.amount} en ${result.merchant} añadido correctamente.`;
        createExpenseMutation.mutate({
          amount: result.amount.toString(),
          description: result.merchant,
          category: result.category,
          date: todayIso(),
          subcategory: "",
          merchantName: result.merchant,
          paymentMethod: "",
          isRecurring: false,
          tags: "",
          notes: "",
          isAutoClassified: false,
        });
      } else {
        setScanPreFill({ amount: result.amount, category: result.category, merchant: result.merchant });
        setIsAddDialogOpen(true);
        toast({
          title: "Revisa los datos",
          description: `Confianza ${Math.round(result.confidence * 100)}%. Ajusta si hace falta y guarda.`,
        });
      }
    } catch (err) {
      toast({
        title: "Error al escanear",
        description: err instanceof Error ? err.message : "No se pudo leer la imagen.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const openAddDialog = () => {
    setScanPreFill(null);
    setIsAddDialogOpen(true);
  };

  const handleParseNotifications = async () => {
    if (!notificationText.trim() || !isAuthenticated) return;
    setIsParsing(true);
    setParsedNotifications(null);
    try {
      const lines = notificationText.split('\n').map(l => l.trim()).filter(Boolean);
      const result = await parseNotifications(lines);
      setParsedNotifications(result.results || []);
      Analytics.notificationParsed();
    } catch (err) {
      toast({
        title: "Error al parsear",
        description: err instanceof Error ? err.message : "No se pudieron procesar las notificaciones",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddParsedAsExpense = (parsed: { amount: number; merchant: string; date: string; category: string }) => {
    const categoryMap: Record<string, string> = {
      food_delivery: "Dining", dining: "Dining", restaurant: "Dining",
      groceries: "Groceries", supermarket: "Groceries",
      transportation: "Transportation", transport: "Transportation", ride: "Transportation",
      entertainment: "Entertainment", streaming: "Entertainment",
      shopping: "Shopping", retail: "Shopping",
      utilities: "Utilities", services: "Utilities",
      healthcare: "Healthcare", pharmacy: "Healthcare",
      education: "Education",
      travel: "Travel",
    };
    const mappedCategory = categoryMap[parsed.category?.toLowerCase()] || "Other";
    createExpenseMutation.mutate({
      name: parsed.merchant,
      amount: parsed.amount.toString(),
      description: parsed.merchant,
      category: mappedCategory,
      date: parsed.date || new Date().toISOString().split('T')[0],
      subcategory: "",
      merchantName: parsed.merchant,
      paymentMethod: "",
      isRecurring: false,
      tags: "",
      notes: "",
      isAutoClassified: true,
    });
  };


  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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

  // Stats: respetar filtro de mes si está seleccionado, sino usar el más reciente con datos
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const expensesByMonth = (y: number, m: number) =>
    expenses.filter(e => { const ym = getYearMonth(e.date); return ym ? ym.y === y && ym.m === m : false; });

  let activeYear = new Date().getFullYear();
  let activeMonth = new Date().getMonth();
  let activeMonthLabel = 'Este mes';
  let activeMonthExpenses: typeof expenses = [];

  if (selectedMonth !== "auto" && selectedMonth.includes("-")) {
    const [y, m] = selectedMonth.split("-").map(Number);
    activeYear = y;
    activeMonth = m - 1;
    activeMonthExpenses = expensesByMonth(activeYear, activeMonth);
    activeMonthLabel = `${monthNames[activeMonth]} ${activeYear}`;
  } else if (expenses.length > 0) {
    const sorted = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestYm = getYearMonth(sorted[0].date);
    if (latestYm) {
      activeYear = latestYm.y;
      activeMonth = latestYm.m;
    }
    activeMonthExpenses = expensesByMonth(activeYear, activeMonth);
    activeMonthLabel = `${monthNames[activeMonth]} ${activeYear}`;
  } else {
    activeMonthExpenses = expensesByMonth(activeYear, activeMonth);
  }

  const activeDaysInMonth = new Date(activeYear, activeMonth + 1, 0).getDate();
  const activeTotal = activeMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const avgPerDay = activeTotal / Math.max(activeDaysInMonth, 1);

  const prevMonthDate = new Date(activeYear, activeMonth - 1, 1);
  const prevMonthTotal = expensesByMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth())
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const trendPct = prevMonthTotal > 0 ? Math.round(((activeTotal - prevMonthTotal) / prevMonthTotal) * 100) : 0;
  const trendType: 'up' | 'down' | 'neutral' = trendPct > 0 ? 'up' : trendPct < 0 ? 'down' : 'neutral';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <ConfirmDestructiveDialog
        open={expensePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setExpensePendingDelete(null);
        }}
        title="¿Eliminar este gasto?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteExpense}
        isPending={deleteExpenseMutation.isPending}
      />
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner
            title="Inicia sesión para gestionar tus gastos"
            description="Aquí verás solo tus gastos registrados y datos importados desde cuentas o documentos."
            actionText="Iniciar sesión"
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
                <h1 className="text-hero-title font-bold">Gastos</h1>
                <p className="text-muted-foreground">Registra y categoriza tus gastos</p>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            className="hidden"
            onChange={handleScanImage}
          />
          <input
            ref={cartolaInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleCartolaUpload}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              disabled={!isAuthenticated || isUploadingCartolas}
              onClick={() => cartolaInputRef.current?.click()}
            >
              {isUploadingCartolas ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Subir cartola
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!isAuthenticated} size="lg" className="gap-2" onClick={openAddDialog}>
                  <Plus className="w-4 h-4" />
                  Añadir gasto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-modal-viewport scroll-touch-momentum overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{scanPreFill ? "Revisar gasto escaneado" : "Añadir gasto (rápido)"}</DialogTitle>
                </DialogHeader>
                <AddExpenseFormLite
                  key={scanPreFill ? `scan-${scanPreFill.amount}-${scanPreFill.category}` : "manual"}
                  defaultAmount={scanPreFill ? String(scanPreFill.amount) : ""}
                  defaultCategory={scanPreFill?.category ?? ""}
                  isPending={createExpenseMutation.isPending}
                  onSubmit={onLiteSubmit}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={activeMonthLabel === 'Este mes' ? 'Total este mes' : `Total ${activeMonthLabel}`}
            value={formatCurrencyFn(activeTotal)}
            trend={{ value: `${Math.abs(trendPct)}% vs mes anterior`, type: trendType }}
            icon={DollarSign}
            color="bg-green-500"
          />
          <StatCard
            title="Promedio diario"
            value={formatCurrencyFn(avgPerDay)}
            subtext={activeMonthLabel === 'Este mes' ? 'Según este mes' : `Según ${activeMonthLabel}`}
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
            subtext={`${activeMonthExpenses.length} ${activeMonthLabel === 'Este mes' ? 'este mes' : 'en ' + activeMonthLabel}`}
            icon={Receipt}
            color="bg-orange-500"
          />
        </div>

        <Tabs defaultValue="movimientos">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="movimientos">Movimientos de cartola</TabsTrigger>
            <TabsTrigger value="manual">Gastos manuales</TabsTrigger>
          </TabsList>

          {/* Tab: Movimientos — todos los movimientos de cartola (ingresos + egresos + saldo) */}
          <TabsContent value="movimientos" className="space-y-3 mt-4">
            {isAuthenticated ? (
              <>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
                    onClick={handleLimpiarCartolas}
                  >
                    <Trash className="h-3.5 w-3.5" />
                    Limpiar datos
                  </Button>
                </div>
                <ParsedTransactionsTable />
              </>
            ) : (
              <SignInBanner
                title="Inicia sesión para ver tus movimientos"
                description="Sube tus cartolas bancarias y visualiza todos tus movimientos categorizados."
                actionText="Iniciar sesión"
              />
            )}
          </TabsContent>

          {/* Tab: Gastos manuales — tabla simple de gastos registrados a mano */}
          <TabsContent value="manual" className="space-y-4 mt-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar gastos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-44 h-9 text-sm">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category.toLowerCase()}>
                      {categoryLabels[category] || categoryLabels[category.toLowerCase()]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Último mes</SelectItem>
                  {availableMonths.map((key) => {
                    const [y, m] = key.split("-").map(Number);
                    const label = `${monthNames[m - 1]} ${y}`;
                    return (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

        {/* Expenses List */}
        <div className="space-y-3">
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((expense) => {
              const Icon = getCategoryIcon(expense.category);
              const colorClass = getCategoryColor(expense.category);
              
              return (
                <SwipeableListRow
                  key={expense.id}
                  canDelete={isAuthenticated}
                  canEdit={isAuthenticated}
                  onDelete={() => setExpensePendingDelete(expense)}
                  onEdit={() => handleEditExpense(expense)}
                >
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="flex">
                      {/* Category Color Bar */}
                      <div className={cn("w-1 self-stretch shrink-0", colorClass)} />
                      
                      <div className="flex-1 min-w-0 p-3 sm:p-4">
                        {/* Top row: icon + name + amount */}
                        <div className="flex items-start gap-3">
                          <div className={cn("p-2.5 sm:p-3 rounded-xl text-white shrink-0", colorClass)}>
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {(expense as Expense & { name?: string }).name && (
                              <span className="text-xs text-muted-foreground truncate block">
                                {(expense as Expense & { name?: string }).name}
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate text-sm sm:text-base">{expense.description}</h3>
                              {expense.isAutoClassified && (
                                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary shrink-0 hidden sm:flex">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Amount - always visible top right */}
                          <p className="text-base sm:text-xl font-bold shrink-0 ml-2">
                            {formatCurrencyFn(Number(expense.amount))}
                          </p>
                        </div>

                        {/* Bottom row: metadata + actions */}
                        <div className="flex items-center justify-between mt-2 ml-[2.75rem] sm:ml-[3.25rem]">
                          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground min-w-0 overflow-hidden">
                            <span className="flex items-center gap-1 shrink-0">
                              <Tag className="h-3 w-3" />
                              <span className="truncate max-w-[80px] sm:max-w-none">{categoryLabels[expense.category] || expense.category}</span>
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Calendar className="h-3 w-3" />
                              {new Date(expense.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                            </span>
                            {expense.isRecurring && (
                              <Badge variant="outline" className="text-xs hidden sm:flex">
                                Recurrente
                              </Badge>
                            )}
                          </div>
                          
                          {/* Actions */}
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-9 w-9 sm:h-10 sm:w-10"
                              onClick={() => handleEditExpense(expense)}
                              disabled={!isAuthenticated}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-9 w-9 sm:h-10 sm:w-10 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setExpensePendingDelete(expense)}
                              disabled={deleteExpenseMutation.isPending || !isAuthenticated}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Tags - only on larger screens */}
                        {parseTags(expense.tags).length > 0 && (
                          <div className="hidden sm:flex items-center gap-1 mt-2 ml-[3.25rem]">
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
                    </div>
                  </CardContent>
                </Card>
                </SwipeableListRow>
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
          </TabsContent>
        </Tabs>

        {/* Notification Parser Dialog */}
        <Dialog open={isNotificationDialogOpen} onOpenChange={(open) => {
          setIsNotificationDialogOpen(open);
          if (!open) { setParsedNotifications(null); setNotificationText(""); }
        }}>
          <DialogContent className="max-w-lg max-h-modal-viewport scroll-touch-momentum overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Agregar desde notificación bancaria
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pega una o más notificaciones de tu banco (una por línea). Soporta Santander, Banco de Chile, BCI, BancoEstado y Scotiabank.
              </p>
              <Textarea
                placeholder={"Ej: Compra por $15.990 en UBER EATS con Tarjeta de Crédito terminada en *1234\nCompra aprobada por $8.500 en STARBUCKS con T.Débito ****5678"}
                rows={5}
                value={notificationText}
                onChange={(e) => setNotificationText(e.target.value)}
              />
              <Button
                onClick={handleParseNotifications}
                disabled={!notificationText.trim() || isParsing}
                className="w-full"
              >
                {isParsing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Procesar notificaciones</>
                )}
              </Button>

              {parsedNotifications && parsedNotifications.length > 0 && (
                <div className="space-y-3">
                  <Separator />
                  <h4 className="font-semibold text-sm">Resultados ({parsedNotifications.length})</h4>
                  {parsedNotifications.map((item, idx) => (
                    <Card key={idx} className="overflow-hidden">
                      <CardContent className="p-3">
                        {item.parsed ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="font-medium">{item.parsed.merchant}</span>
                              </div>
                              <span className="font-bold text-lg">
                                {formatCurrencyFn(item.parsed.amount)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{item.parsed.bank}</span>
                              <span>{item.parsed.cardType}</span>
                              <span>{item.parsed.date}</span>
                              <Badge variant="secondary" className="text-xs">
                                {categoryLabels[
                                  Object.entries({
                                    food_delivery: "Dining", dining: "Dining",
                                    groceries: "Groceries", transportation: "Transportation",
                                    entertainment: "Entertainment", shopping: "Shopping",
                                    utilities: "Utilities", healthcare: "Healthcare",
                                  }).find(([k]) => k === item.parsed!.category?.toLowerCase())?.[1] || "Other"
                                ] || item.parsed.category}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full mt-1"
                              onClick={() => {
                                handleAddParsedAsExpense(item.parsed!);
                                toast({ title: "Agregado", description: `${item.parsed!.merchant} - ${formatCurrencyFn(item.parsed!.amount)}` });
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar como gasto
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <span className="truncate">{item.original}</span>
                            <span className="text-xs text-red-500 ml-auto">No reconocido</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Expense Dialog - Simplified (name, amount, category with icons) */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-modal-viewport scroll-touch-momentum overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Cena, Supermercado..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <Input placeholder="0" {...field} />
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
                    <div className="grid grid-cols-4 gap-2">
                      {categories.map((cat) => {
                        const Icon = getCategoryIcon(cat);
                        const isSelected = field.value === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => field.onChange(cat)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all",
                              isSelected
                                ? `${getCategoryColor(cat)} border-primary text-white`
                                : "border-muted hover:border-muted-foreground/50 bg-muted/30"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-[10px] font-medium truncate w-full text-center">
                              {categoryLabels[cat] || cat}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
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
