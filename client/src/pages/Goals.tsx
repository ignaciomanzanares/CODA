import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApi } from "@/lib/api"; // <-- Use only useApi
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
import { useAuth0 } from "@auth0/auth0-react";

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
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const { toast } = useToast();

  // Get API functions from useApi
  const { 
    getFinancialGoals, 
    createFinancialGoal, 
    updateFinancialGoal, 
    deleteFinancialGoal 
  } = useApi();

  // Only fetch goals if authenticated and not loading
  const { data: goals, isLoading, error } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals,
    enabled: isAuthenticated && !authLoading,
  });

  // Add goal mutation
  const addGoalMutation = useMutation({
    mutationFn: createFinancialGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      setIsAddGoalOpen(false);
      toast({
        title: "Goal created",
        description: "Your financial goal has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create financial goal",
        variant: "destructive",
      });
    },
  });

  // Edit goal mutation
  const editGoalMutation = useMutation({
    mutationFn: (data: { id: string; goal: any }) => 
      updateFinancialGoal(data.id, data.goal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      setIsEditGoalOpen(false);
      setSelectedGoal(null);
      toast({
        title: "Goal updated",
        description: "Your financial goal has been updated successfully.",
      });
    },
    onError: (error) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] });
      toast({
        title: "Goal deleted",
        description: "Your financial goal has been deleted.",
      });
    },
    onError: (error) => {
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
    addGoalMutation.mutate({
      ...values,
      targetDate: new Date(values.targetDate),
    });
  };

  const handleEditSubmit = (values: GoalFormValues) => {
    if (selectedGoal) {
      editGoalMutation.mutate({
        id: String(selectedGoal.id),
        goal: {
          ...values,
          targetDate: new Date(values.targetDate),
        }
      });
    }
  };

  const handleEditGoal = (goal: any) => {
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

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 font-sans">Financial Goals</h2>
        <p className="mb-4">Please sign in to view and manage your financial goals.</p>
      </div>
    );
  }

  if (isLoading) {
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
      {/* ...rest of your component unchanged... */}
      {/* All rendering logic for goals, dialogs, forms, etc. */}
      {/* This part is unchanged from your original code */}
      {/* ... */}
    </div>
  );
}