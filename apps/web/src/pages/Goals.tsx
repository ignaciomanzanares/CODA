import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Pencil, Trash2, Target, PiggyBank, School, Home, ArrowDown, Landmark } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { generateDemoFinancialGoals } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import type { Goal, UpdateGoalData } from "@/types";

// Form schema for adding/editing a goal
const goalFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  targetAmount: z.coerce.number().min(1, "Target amount is required"),
  currentAmount: z.coerce.number().min(0, "Current amount must be 0 or more"),
  targetDate: z.string().min(1, "Target date is required"),
  category: z.enum(["savings", "debt_repayment", "retirement", "home", "education", "other"]),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

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

  // Use demo data when not authenticated, real data when authenticated
  const demoGoals = generateDemoFinancialGoals();
  
  // Only fetch goals if authenticated and not loading
  const { data: realGoals, isLoading, error } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    enabled: isAuthenticated && !authLoading,
    staleTime: 0, // Ensure we always get fresh data from cache
  });
  
  const goals = isAuthenticated ? realGoals : demoGoals;

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      // Also refresh notifications so the goal-created notification appears immediately
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setIsAddGoalOpen(false);
      addForm.reset();
      toast({
        title: "Goal created",
        description: "Your financial goal has been created successfully.",
      });
    },
    onError: (error, newGoal, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["/api/financial-goals"], context.previousGoals);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create financial goal",
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
    onSuccess: (data) => {
      // Update the cache with the real data from server
      if (data) {
        const previousGoals = queryClient.getQueryData<Goal[]>(["/api/financial-goals"]);
        if (previousGoals) {
          const updatedGoals = previousGoals.map(goal => 
            goal.id === data.id ? data : goal
          );
          queryClient.setQueryData<Goal[]>(["/api/financial-goals"], updatedGoals);
        }
      }
      // Invalidate notifications to show goal milestone notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setIsEditGoalOpen(false);
      setSelectedGoal(null);
      editForm.reset();
      toast({
        title: "Goal updated",
        description: "Your financial goal has been updated successfully.",
      });
    },
    onError: (error, variables, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["/api/financial-goals"], context.previousGoals);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update financial goal",
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
    onSuccess: () => {
      // Don't invalidate - the optimistic update already removed it
      toast({
        title: "Goal deleted",
        description: "Your financial goal has been deleted.",
      });
    },
    onError: (error, goalId, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(["/api/financial-goals"], context.previousGoals);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete financial goal",
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.round((current / target) * 100);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "savings":
        return <PiggyBank className="h-6 w-6" />;
      case "debt_repayment":
        return <ArrowDown className="h-6 w-6" />;
      case "retirement":
        return <Landmark className="h-6 w-6" />;
      case "home":
        return <Home className="h-6 w-6" />;
      case "education":
        return <School className="h-6 w-6" />;
      default:
        return <Target className="h-6 w-6" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "savings":
        return "Savings";
      case "debt_repayment":
        return "Debt Repayment";
      case "retirement":
        return "Retirement";
      case "home":
        return "Home";
      case "education":
        return "Education";
      default:
        return "Other";
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800 font-sans">Financial Goals</h2>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }


  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800 font-sans">Financial Goals</h2>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 font-sans">Financial Goals</h2>
        <p className="text-red-500 mb-4">
          {error instanceof Error
            ? error.message
            : "Failed to load financial goals"}
        </p>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] })}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!isAuthenticated && (
        <SignInBanner 
          title="Viewing Demo Financial Goals"
          description="You're exploring sample financial goals with progress tracking. Sign in to create and manage your real financial objectives, set target dates, and track your progress."
          actionText="Sign In to Track Real Goals"
        />
      )}
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 font-sans">Financial Goals</h2>
        <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2" disabled={!isAuthenticated}>
              <Plus className="h-4 w-4" />
              Add Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Financial Goal</DialogTitle>
              <DialogDescription>
                Create a new financial goal to track your progress.
              </DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(handleAddSubmit)} className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Goal Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Emergency Fund" {...field} />
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
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="savings">Savings</SelectItem>
                          <SelectItem value="debt_repayment">Debt Repayment</SelectItem>
                          <SelectItem value="retirement">Retirement</SelectItem>
                          <SelectItem value="home">Home</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
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
                        <FormLabel>Target Amount</FormLabel>
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
                        <FormLabel>Current Amount</FormLabel>
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
                      <FormLabel>Target Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddGoalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addGoalMutation.isPending}>
                    {addGoalMutation.isPending ? "Creating..." : "Create Goal"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goals Grid */}
      {goals && goals.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal: Goal) => (
            <Card key={goal.id} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getCategoryIcon(goal.category)}
                    <div>
                      <CardTitle className="text-lg">{goal.name}</CardTitle>
                      <CardDescription>{getCategoryLabel(goal.category)}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditGoal(goal)}
                      disabled={!isAuthenticated}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={!isAuthenticated}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Goal</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &quot;{goal.name}&quot;? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{calculateProgress(goal.currentAmount, goal.targetAmount)}%</span>
                  </div>
                  <Progress value={calculateProgress(goal.currentAmount, goal.targetAmount)} />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Current</p>
                    <p className="font-semibold">{formatCurrency(goal.currentAmount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Target</p>
                    <p className="font-semibold">{formatCurrency(goal.targetAmount)}</p>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="text-gray-600">Target Date</p>
                  <p className="font-semibold">{format(new Date(goal.targetDate), "MMM dd, yyyy")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Set a &quot;SMART&quot; Goal</h3>
          <p className="text-gray-600 mb-6">Create your first financial goal to start tracking your progress.</p>
          <Button onClick={() => setIsAddGoalOpen(true)} disabled={!isAuthenticated}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Goal
          </Button>
        </div>
      )}

      {/* Edit Goal Dialog */}
      <Dialog open={isEditGoalOpen} onOpenChange={setIsEditGoalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Financial Goal</DialogTitle>
            <DialogDescription>
              Update your financial goal details.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Goal Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Emergency Fund" {...field} />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="debt_repayment">Debt Repayment</SelectItem>
                        <SelectItem value="retirement">Retirement</SelectItem>
                        <SelectItem value="home">Home</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
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
                      <FormLabel>Target Amount</FormLabel>
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
                      <FormLabel>Current Amount</FormLabel>
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
                    <FormLabel>Target Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditGoalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editGoalMutation.isPending}>
                  {editGoalMutation.isPending ? "Updating..." : "Update Goal"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}