import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getFinancialGoals, createFinancialGoal, updateFinancialGoal, deleteFinancialGoal } from "@/lib/api";
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
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const { toast } = useToast();
  
  const { data: goals, isLoading, error } = useQuery({
    queryKey: ["/api/financial-goals"],
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
    mutationFn: (data: { id: number; goal: any }) => 
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
    mutationFn: deleteFinancialGoal,
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
        id: selectedGoal.id,
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

  const handleDeleteGoal = (goalId: number) => {
    deleteGoalMutation.mutate(goalId);
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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 font-sans">Financial Goals</h2>
        <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add New Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Financial Goal</DialogTitle>
              <DialogDescription>
                Set a new financial goal to track your progress.
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
                        <Input placeholder="E.g., Emergency Fund" {...field} />
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
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
                        <FormLabel>Target Amount ($)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="100" {...field} />
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
                        <FormLabel>Current Amount ($)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="100" {...field} />
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddGoalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={addGoalMutation.isPending}
                  >
                    {addGoalMutation.isPending ? "Adding..." : "Add Goal"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

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
                      <Input {...field} />
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
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
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
                      <FormLabel>Target Amount ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="100" {...field} />
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
                      <FormLabel>Current Amount ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="100" {...field} />
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditGoalOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={editGoalMutation.isPending}
                >
                  {editGoalMutation.isPending ? "Updating..." : "Update Goal"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Goals Grid */}
      {goals && goals.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal: any) => (
            <Card key={goal.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    <div className="mr-3 bg-primary bg-opacity-10 p-2 rounded-full">
                      {getCategoryIcon(goal.category)}
                    </div>
                    <div>
                      <CardTitle>{goal.name}</CardTitle>
                      <CardDescription>{getCategoryLabel(goal.category)}</CardDescription>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    By {format(new Date(goal.targetDate), "MMM dd, yyyy")}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="mt-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm font-medium text-primary">
                      {calculateProgress(goal.currentAmount, goal.targetAmount)}%
                    </span>
                  </div>
                  <Progress 
                    value={calculateProgress(goal.currentAmount, goal.targetAmount)} 
                    className="h-2"
                  />
                  <div className="flex justify-between mt-2 text-sm text-gray-500">
                    <span>Current: {formatCurrency(goal.currentAmount)}</span>
                    <span>Target: {formatCurrency(goal.targetAmount)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleEditGoal(goal)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your financial goal. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <div className="mb-4">
            <Target className="h-12 w-12 mx-auto text-gray-400" />
          </div>
          <h3 className="text-lg font-medium mb-2">No financial goals yet</h3>
          <p className="text-gray-500 mb-6">Start setting your financial goals to track your progress and achieve your dreams.</p>
          <Button 
            onClick={() => setIsAddGoalOpen(true)}
            className="mx-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Goal
          </Button>
        </Card>
      )}
    </div>
  );
}
