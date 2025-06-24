import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, DollarSign, Check, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import type { BillSplit, BillSplitParticipant } from "@shared/schema";

const participantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
});

const billSplitFormSchema = z.object({
  name: z.string().min(1, "Bill name is required"),
  totalAmount: z.string().min(1, "Total amount is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  participants: z.array(participantSchema).min(1, "At least one participant required"),
});

type BillSplitFormValues = z.infer<typeof billSplitFormSchema>;

interface BillSplitWithParticipants extends BillSplit {
  participants?: BillSplitParticipant[];
}

export default function BillSplit() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: billSplits = [], isLoading } = useQuery<BillSplitWithParticipants[]>({
    queryKey: ["/api/bill-splits"],
  });

  const createBillSplitMutation = useMutation({
    mutationFn: (billSplit: BillSplitFormValues) => {
      const totalAmount = parseFloat(billSplit.totalAmount);
      const amountPerPerson = totalAmount / billSplit.participants.length;
      
      return apiRequest("/api/bill-splits", "POST", {
        name: billSplit.name,
        totalAmount: billSplit.totalAmount,
        description: billSplit.description,
        date: new Date(billSplit.date),
        participants: billSplit.participants.map(p => ({
          ...p,
          amountOwed: amountPerPerson.toFixed(2),
          amountPaid: "0",
          isPaid: false,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
  });

  const form = useForm<BillSplitFormValues>({
    resolver: zodResolver(billSplitFormSchema),
    defaultValues: {
      name: "",
      totalAmount: "",
      description: "",
      date: new Date().toISOString().split('T')[0],
      participants: [{ name: "", email: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "participants",
  });

  const onSubmit = (values: BillSplitFormValues) => {
    createBillSplitMutation.mutate(values);
  };

  const totalOwed = billSplits.reduce((sum, split) => {
    const participants = split.participants || [];
    return sum + participants.reduce((splitSum, p) => splitSum + parseFloat(p.amountOwed), 0);
  }, 0);

  const totalPaid = billSplits.reduce((sum, split) => {
    const participants = split.participants || [];
    return sum + participants.reduce((splitSum, p) => splitSum + parseFloat(p.amountPaid), 0);
  }, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bill Splitting</h1>
          <p className="text-gray-600">Split expenses with friends and track payments</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Split
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Bill Split</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bill Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Dinner at restaurant" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Amount</FormLabel>
                      <FormControl>
                        <Input placeholder="120.00" {...field} />
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
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional details about the expense" {...field} />
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
                
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <FormLabel>Participants</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ name: "", email: "" })}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Person
                    </Button>
                  </div>
                  
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      <FormField
                        control={form.control}
                        name={`participants.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="Friend's name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2">
                        <FormField
                          control={form.control}
                          name={`participants.${index}.email`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormControl>
                                <Input placeholder="Email (optional)" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => remove(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {form.watch("totalAmount") && form.watch("participants").length > 0 && (
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600">
                      Each person owes: ${(parseFloat(form.watch("totalAmount") || "0") / form.watch("participants").length).toFixed(2)}
                    </p>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createBillSplitMutation.isPending}
                >
                  {createBillSplitMutation.isPending ? "Creating..." : "Create Bill Split"}
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
              <DollarSign className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Owed</p>
                <p className="text-2xl font-bold">${(totalOwed - totalPaid).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Check className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Paid</p>
                <p className="text-2xl font-bold">${totalPaid.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Splits</p>
                <p className="text-2xl font-bold">{billSplits.filter(s => s.status === "active").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bill Splits List */}
      <div className="space-y-4">
        {billSplits.map((split) => {
          const participants = split.participants || [];
          const paidParticipants = participants.filter(p => p.isPaid).length;
          const totalParticipants = participants.length;
          
          return (
            <Card key={split.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{split.name}</CardTitle>
                    <p className="text-sm text-gray-600">
                      {new Date(split.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${parseFloat(split.totalAmount).toFixed(2)}</p>
                    <Badge variant={split.status === "active" ? "default" : "secondary"}>
                      {split.status}
                    </Badge>
                  </div>
                </div>
                {split.description && (
                  <p className="text-sm text-gray-600">{split.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Payment Progress</span>
                    <span>{paidParticipants}/{totalParticipants} paid</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${(paidParticipants / totalParticipants) * 100}%` }}
                    ></div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {participants.map((participant) => (
                      <div 
                        key={participant.id} 
                        className="flex items-center justify-between p-3 border rounded"
                      >
                        <div>
                          <p className="font-medium">{participant.name}</p>
                          <p className="text-sm text-gray-600">
                            ${parseFloat(participant.amountOwed).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {participant.isPaid ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              <Check className="w-3 h-3 mr-1" />
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                          {!participant.isPaid && participant.email && (
                            <Button variant="outline" size="sm">
                              <Send className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {billSplits.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No bill splits yet. Create your first split to get started!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}