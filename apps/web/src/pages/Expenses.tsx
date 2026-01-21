import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit2, Trash2, Tag, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useApi } from "@/lib/api";
import type { Expense } from "@coda/db";
import { useAuth } from "@/lib/auth";
import { generateDemoExpenses } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import { useToast } from "@/hooks/use-toast";

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
  amount: z.string().min(1, "Amount is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().optional(),
  merchantName: z.string().optional(),
  date: z.string().min(1, "Date is required"),
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

export default function Expenses() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { getExpenses, createExpense, updateExpense, deleteExpense } = useApi();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
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
    onMutate: async (newExpense) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/expenses"] });
      
      // Snapshot previous value
      const previousExpenses = queryClient.getQueryData<Expense[]>(["/api/expenses"]);
      
      // Optimistically update to new value
      if (previousExpenses) {
        const optimisticExpense: Expense = {
          id: Date.now(), // Temporary ID
          userId: "temp",
          amount: newExpense.amount.toString(),
          description: newExpense.description,
          category: newExpense.category,
          subcategory: newExpense.subcategory || null,
          merchantName: newExpense.merchantName || null,
          // Create a Date object that treats the date as local time, not UTC
          date: (() => {
            const [year, month, day] = newExpense.date.split('-').map(Number);
            return new Date(year, month - 1, day); // month is 0-indexed
          })(),
          paymentMethod: newExpense.paymentMethod || null,
          isRecurring: newExpense.isRecurring || false,
          tags: newExpense.tags ? newExpense.tags.split(",").map(t => t.trim()) : null,
          notes: newExpense.notes || null,
          isAutoClassified: newExpense.isAutoClassified || true,
          confidence: null,
          createdAt: new Date()
        };
        queryClient.setQueryData<Expense[]>(["/api/expenses"], [...previousExpenses, optimisticExpense]);
      }
      
      return { previousExpenses };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      // Invalidate notifications to show new expense notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Expense added",
        description: "Your expense has been added successfully.",
      });
    },
    onError: (error, newExpense, context) => {
      // Rollback on error
      if (context?.previousExpenses) {
        queryClient.setQueryData(["/api/expenses"], context.previousExpenses);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add expense",
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
        title: "Expense updated",
        description: "Your expense has been updated successfully.",
      });
    },
    onError: (error, variables, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(["/api/expenses"], context.previousExpenses);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update expense",
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
        title: "Expense deleted",
        description: "Your expense has been deleted successfully.",
      });
    },
    onError: (error, id, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(["/api/expenses"], context.previousExpenses);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete expense",
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

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

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
      <div className="container py-8 space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {!isAuthenticated && (
        <SignInBanner 
          title="Viewing Demo Expense Data"
          description="You're seeing sample expense data to explore our features. Sign in to track your real expenses, add new transactions, and sync with your bank accounts."
          actionText="Sign In to Track Real Expenses"
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-gray-600">Track and categorize your spending</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!isAuthenticated}>
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Expense</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
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
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="What did you buy?" {...field} />
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
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
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
                  control={form.control}
                  name="merchantName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Merchant (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Store or business name" {...field} />
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
                      <FormLabel>Date</FormLabel>
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
                        <Input placeholder="vacation, work, gift (comma separated)" {...field} />
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
                        <FormLabel className="text-base">Auto-classify</FormLabel>
                        <div className="text-sm text-gray-500">
                          Let AI categorize this expense
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
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
                  {createExpenseMutation.isPending ? "Adding..." : "Add Expense"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Expenses</p>
                <p className="text-2xl font-bold">${totalExpenses.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Tag className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Categories</p>
                <p className="text-2xl font-bold">{new Set(expenses.map(e => e.category)).size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">This Month</p>
                <p className="text-2xl font-bold">{filteredExpenses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expenses List */}
      <div className="space-y-4">
        {filteredExpenses.map((expense) => (
          <Card key={expense.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{expense.description}</h3>
                    {expense.isAutoClassified && (
                      <Badge variant="secondary" className="text-xs">
                        Auto-classified
                      </Badge>
                    )}
                    {expense.isRecurring && (
                      <Badge variant="outline" className="text-xs">
                        Recurring
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">Category:</span> {expense.category}
                      {expense.subcategory && ` > ${expense.subcategory}`}
                    </p>
                    {expense.merchantName && (
                      <p><span className="font-medium">Merchant:</span> {expense.merchantName}</p>
                    )}
                    <p><span className="font-medium">Date:</span> {new Date(expense.date).toLocaleDateString()}</p>
                    {parseTags(expense.tags).length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Tags:</span>
                        {parseTags(expense.tags).map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">${parseFloat(expense.amount).toFixed(2)}</p>
                  <div className="flex gap-2 mt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEditExpense(expense)}
                      disabled={!isAuthenticated}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => deleteExpenseMutation.mutate(expense.id)}
                      disabled={deleteExpenseMutation.isPending || !isAuthenticated}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredExpenses.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-gray-500">No expenses found. Add your first expense to get started!</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="What did you buy?" {...field} />
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
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
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
                    <FormLabel>Merchant (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Store or business name" {...field} />
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
                    <FormLabel>Date</FormLabel>
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
                      <Input placeholder="vacation, work, gift (comma separated)" {...field} />
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
                      <FormLabel className="text-base">Auto-classify</FormLabel>
                      <div className="text-sm text-gray-500">
                        Let AI categorize this expense
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
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
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={updateExpenseMutation.isPending}
                >
                  {updateExpenseMutation.isPending ? "Updating..." : "Update Expense"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
