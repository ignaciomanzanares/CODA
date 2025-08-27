import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, DollarSign, Check, Clock, Send, Archive, CheckCircle, CreditCard, Smartphone, Mail, Trash2, Filter, ExternalLink } from "lucide-react";
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
import { useApi } from "@/lib/api";
import type { BillSplit, BillSplitParticipant } from "@shared/schema";
import { useAuth0 } from "@auth0/auth0-react";
import { generateDemoBillSplits } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import PaymentDialog from "@/components/PaymentDialog";

const participantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().optional().refine((val) => {
    if (!val || val === "") return true; // Allow empty string
    return z.string().email().safeParse(val).success; // Validate email format if provided
  }, {
    message: "Please enter a valid email address"
  }),
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
  userRole?: 'creator' | 'participant' | 'none';
}

type FilterOption = 'all' | 'active' | 'settled';

export default function BillSplit() {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth0();
  const { getBillSplits, createBillSplit, markParticipantAsPaid, archiveBillSplit, deleteBillSplit } = useApi();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    isOpen: boolean;
    billSplit?: BillSplitWithParticipants;
    participant?: BillSplitParticipant;
  }>({ isOpen: false });
  const queryClient = useQueryClient();
  
  // Check for highlight parameter from email invitations and handle auth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    
    if (highlightId) {
      if (!authLoading && !isAuthenticated) {
        // User clicked email link but isn't authenticated, store the bill ID and redirect to login
        localStorage.setItem('highlightBillAfterAuth', highlightId);
        loginWithRedirect({
          appState: { targetUrl: `/bill-split?highlight=${highlightId}` }
        });
        return;
      }
      
      if (isAuthenticated) {
        setHighlightedBillId(highlightId);
        // Clear the highlight after 8 seconds to give more time to see it
        setTimeout(() => setHighlightedBillId(null), 8000);
        // Clean up stored bill ID if it exists
        localStorage.removeItem('highlightBillAfterAuth');
      }
    } else if (isAuthenticated) {
      // Check if there's a stored bill ID from before auth
      const storedBillId = localStorage.getItem('highlightBillAfterAuth');
      if (storedBillId) {
        setHighlightedBillId(storedBillId);
        setTimeout(() => setHighlightedBillId(null), 8000);
        localStorage.removeItem('highlightBillAfterAuth');
        // Update URL to include highlight parameter
        window.history.replaceState(null, '', `/bill-split?highlight=${storedBillId}`);
      }
    }
  }, [authLoading, isAuthenticated, loginWithRedirect]);

  // Use demo data when not authenticated, real data when authenticated
  const demoBillSplits = generateDemoBillSplits();
  
  const { data: realBillSplits = [], isLoading } = useQuery<BillSplitWithParticipants[]>({
    queryKey: ["/api/bill-splits"],
    queryFn: getBillSplits,
    enabled: isAuthenticated && !authLoading,
  });

  const allBillSplits = isAuthenticated ? realBillSplits : demoBillSplits;
  
  // Filter bill splits based on selected filter
  const filteredBillSplits = allBillSplits.filter(split => {
    if (filter === 'all') return true;
    return split.status === filter;
  });
  
  const billSplits = filteredBillSplits;

  const createBillSplitMutation = useMutation({
    mutationFn: (billSplit: BillSplitFormValues) => {
      const totalAmount = parseFloat(billSplit.totalAmount);
      const amountPerPerson = totalAmount / billSplit.participants.length;
      
      return createBillSplit({
        name: billSplit.name,
        totalAmount: totalAmount,
        description: billSplit.description,
        date: new Date(billSplit.date),
        participants: billSplit.participants.map(p => ({
          userId: '', // Will be set by the server
          amount: amountPerPerson,
          isPaid: false,
          ...p,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
      // Invalidate notifications to show bill split notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: ({ billSplitId, participantId, amountPaid }: { billSplitId: string; participantId: string; amountPaid?: number }) => {
      return markParticipantAsPaid(billSplitId, participantId, amountPaid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
      // Invalidate notifications to show payment notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const archiveSplitMutation = useMutation({
    mutationFn: (billSplitId: string) => {
      return archiveBillSplit(billSplitId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
    },
  });

  const deleteSplitMutation = useMutation({
    mutationFn: (billSplitId: string) => {
      return deleteBillSplit(billSplitId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
    },
  });

  const handleMarkAsPaid = (billSplitId: string, participantId: string, amountPaid?: number) => {
    if (isAuthenticated) {
      markAsPaidMutation.mutate({ billSplitId, participantId, amountPaid });
    }
  };

  const handleArchiveSplit = (billSplitId: string) => {
    if (isAuthenticated && confirm('Are you sure you want to archive this bill split?')) {
      archiveSplitMutation.mutate(billSplitId);
    }
  };

  const handleDeleteSplit = (billSplitId: string) => {
    if (isAuthenticated && confirm('Are you sure you want to delete this bill split? This action cannot be undone.')) {
      deleteSplitMutation.mutate(billSplitId);
    }
  };

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
    return sum + participants.reduce((splitSum, p) => splitSum + parseFloat(p.amountPaid || '0'), 0);
  }, 0);

  if (authLoading || (isAuthenticated && isLoading)) {
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
      {!isAuthenticated && (
        <SignInBanner 
          title="Viewing Demo Bill Splits"
          description="You're exploring sample bill splitting data. Sign in to create real bill splits, invite friends, and track payments together."
          actionText="Sign In to Split Real Bills"
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bill Splitting</h1>
          <p className="text-gray-600">Split expenses with friends and track payments</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!isAuthenticated}>
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
                <p className="text-2xl font-bold">{allBillSplits.filter(s => s.status === "active").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-600">Filter:</span>
          <div className="flex gap-1">
            {(['all', 'active', 'settled'] as FilterOption[]).map((filterOption) => (
              <Button
                key={filterOption}
                variant={filter === filterOption ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(filterOption)}
                className="capitalize"
              >
                {filterOption === 'all' ? 'All' : filterOption}
                <Badge 
                  variant="secondary" 
                  className="ml-2 text-xs"
                >
                  {filterOption === 'all' 
                    ? allBillSplits.length 
                    : allBillSplits.filter(s => s.status === filterOption).length
                  }
                </Badge>
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Showing {billSplits.length} of {allBillSplits.length} splits
        </p>
      </div>

      {/* Bill Splits List */}
      <div className="space-y-4">
        {billSplits.map((split) => {
          const participants = split.participants || [];
          const paidParticipants = participants.filter(p => p.isPaid).length;
          const totalParticipants = participants.length;
          
          const isHighlighted = highlightedBillId === String(split.id);
          
          return (
            <Card 
              key={split.id} 
              className={isHighlighted ? 'ring-2 ring-blue-500 bg-blue-50/50 transition-all duration-500' : ''}
            >
              {isHighlighted && (
                <div className="bg-blue-100 border-b border-blue-200 px-6 py-2">
                  <p className="text-sm text-blue-700 font-medium">
                    📧 You accessed this bill split from an email invitation!
                  </p>
                </div>
              )}
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{split.name}</CardTitle>
                    <p className="text-sm text-gray-600">
                      {new Date(split.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-2xl font-bold">${parseFloat(split.totalAmount).toFixed(2)}</p>
                      <Badge variant={split.status === "active" ? "default" : "secondary"}>
                        {split.status}
                      </Badge>
                    </div>
                    {/* Complete button for active bills that are fully paid */}
                    {isAuthenticated && split.userRole === 'creator' && split.status === "active" && paidParticipants === totalParticipants && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchiveSplit(String(split.id))}
                        disabled={archiveSplitMutation.isPending}
                        className="text-green-600 border-green-600 hover:bg-green-50"
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        Complete
                      </Button>
                    )}
                    {/* Delete button for settled bills */}
                    {isAuthenticated && split.userRole === 'creator' && split.status === "settled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSplit(String(split.id))}
                        disabled={deleteSplitMutation.isPending}
                        className="text-red-600 border-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    )}
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
                            <>
                              <Badge variant="outline">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending
                              </Badge>
                              {/* Creators can mark any participant as paid */}
                              {isAuthenticated && split.userRole === 'creator' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMarkAsPaid(
                                    String(split.id),
                                    String(participant.id),
                                    parseFloat(participant.amountOwed)
                                  )}
                                  disabled={markAsPaidMutation.isPending}
                                  className="text-green-600 border-green-600 hover:bg-green-50"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Mark Paid
                                </Button>
                              )}
                              {/* Participants can pay their share */}
                              {isAuthenticated && split.userRole === 'participant' && participant.isCurrentUser && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => setPaymentDialog({
                                    isOpen: true,
                                    billSplit: split,
                                    participant: participant
                                  })}
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <CreditCard className="w-3 h-3 mr-1" />
                                  Pay Now
                                </Button>
                              )}
                              {!participant.isPaid && participant.email && (
                                <Button variant="outline" size="sm" disabled={!isAuthenticated}>
                                  <Send className="w-3 h-3" />
                                </Button>
                              )}
                            </>
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
              <p className="text-gray-500">
                {allBillSplits.length === 0 
                  ? "No bill splits yet. Create your first split to get started!"
                  : `No ${filter === 'all' ? '' : filter} bill splits found. Try switching filters.`
                }
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment Dialog */}
      {paymentDialog.isOpen && paymentDialog.billSplit && paymentDialog.participant && (
        <PaymentDialog
          isOpen={paymentDialog.isOpen}
          onClose={() => setPaymentDialog({ isOpen: false })}
          amount={parseFloat(paymentDialog.participant.amountOwed).toFixed(2)}
          participantName={paymentDialog.participant.name}
          billName={paymentDialog.billSplit.name}
          creatorName={paymentDialog.billSplit.createdByName || 'Bill Creator'}
          onPaymentComplete={() => {
            if (paymentDialog.billSplit && paymentDialog.participant) {
              handleMarkAsPaid(
                String(paymentDialog.billSplit.id),
                String(paymentDialog.participant.id),
                parseFloat(paymentDialog.participant.amountOwed)
              );
            }
          }}
        />
      )}
    </div>
  );
}
