import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFinancialGoals } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link } from "wouter";

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
  name: z.string().min(2, "Name must be at least 2 characters"),
  targetAmount: z.coerce.number().min(1, "Target amount is required"),
  currentAmount: z.coerce.number().min(0, "Current amount must be 0 or more"),
  targetDate: z.string().min(1, "Target date is required"),
  category: z.enum(["savings", "debt_repayment", "retirement", "home", "education", "other"]),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

export default function FinancialGoalsCard() {
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const { toast } = useToast();
  const { getFinancialGoals, createFinancialGoal } = useFinancialGoals();
  
  const { data: goals, isLoading, error } = useQuery({
    queryKey: ["/api/financial-goals"],
    queryFn: getFinancialGoals
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-bold">Financial Goals</h3>
            <Skeleton className="h-6 w-24" />
          </div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full mb-4" />
          ))}
          <Skeleton className="h-10 w-full mt-4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-4">Financial Goals</h3>
          <div className="text-center py-8">
            <p className="text-red-500">
              {error instanceof Error
                ? error.message
                : "Failed to load financial goals"}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/financial-goals"] })}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">Financial Goals</h3>
          <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-primary flex items-center text-sm font-medium">
                <Plus className="h-4 w-4 mr-1" />
                Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Financial Goal</DialogTitle>
                <DialogDescription>
                  Set a new financial goal to track your progress.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
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
                    control={form.control}
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
                      control={form.control}
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
                      control={form.control}
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
                    control={form.control}
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

        <div className="space-y-4">
          {goals && goals.length > 0 ? (
            goals.map((goal: FinancialGoal) => (
              <div
                key={goal.id}
                className="border border-gray-200 rounded-lg p-3 hover:border-primary transition-colors"
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium">{goal.name}</div>
                  <div className="text-xs text-gray-500">
                    By {format(new Date(goal.targetDate), "MMM yyyy")}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{
                      width: `${calculateProgress(goal.currentAmount, goal.targetAmount)}%`,
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs">
                  <div className="text-gray-500">
                    {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
                  </div>
                  <div className="text-primary font-medium">
                    {calculateProgress(goal.currentAmount, goal.targetAmount)}%
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No financial goals yet. Add your first goal to start tracking your progress.</p>
            </div>
          )}
        </div>

        <Link href="/goals">
          <Button variant="outline" className="mt-6 w-full">
            Manage Goals
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
