import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { connectBank } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface BankConnectionCardProps {
  bankName: string;
  bankLogo?: React.ReactNode;
  description?: string;
}

// Form schema for connecting a bank
const bankConnectionSchema = z.object({
  bankName: z.string().min(1, "Bank name is required"),
  accountType: z.enum(["checking", "savings", "credit_card", "investment", "loan", "mortgage"]),
  credentials: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

type BankConnectionValues = z.infer<typeof bankConnectionSchema>;

export default function BankConnectionCard({
  bankName,
  bankLogo,
  description = "Connect your accounts to analyze your credit profile.",
}: BankConnectionCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  // Mutation for connecting bank
  const connectBankMutation = useMutation({
    mutationFn: connectBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-connections"] });
      setIsDialogOpen(false);
      toast({
        title: "Bank connected",
        description: `Your ${bankName} account has been connected successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Could not connect to bank. Please try again.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<BankConnectionValues>({
    resolver: zodResolver(bankConnectionSchema),
    defaultValues: {
      bankName,
      accountType: "checking",
      credentials: {
        username: "",
        password: "",
      },
    },
  });

  const onSubmit = (values: BankConnectionValues) => {
    connectBankMutation.mutate(values);
  };

  return (
    <Card className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col items-center hover:border-primary transition-colors">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        {bankLogo || (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 6l9-4 9 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"
            />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-bold mb-2">{bankName}</h3>
      <p className="text-gray-500 text-sm text-center mb-4">
        {description}
      </p>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="mt-auto w-full"
          >
            Connect
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to {bankName}</DialogTitle>
            <DialogDescription>
              Enter your {bankName} credentials to securely connect your account.
              We use bank-level security to protect your information.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
                        <SelectItem value="loan">Loan</SelectItem>
                        <SelectItem value="mortgage">Mortgage</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="credentials.username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Your bank username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="credentials.password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Your bank password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={connectBankMutation.isPending}
                >
                  {connectBankMutation.isPending ? "Connecting..." : "Connect Account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
