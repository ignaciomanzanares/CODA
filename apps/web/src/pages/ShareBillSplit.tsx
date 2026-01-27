import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/api.tsx';
import { apiFetch } from '@/lib/api';
import { 
  Receipt, 
  Users, 
  Check, 
  Clock, 
  CreditCard, 
  DollarSign,
  ExternalLink,
  CheckCircle,
  Loader2,
  AlertCircle,
  PartyPopper,
  UserPlus,
  LogIn
} from 'lucide-react';

interface Participant {
  id: number;
  name: string;
  amountOwed: number;
  isPaid: boolean;
  amountPaid: number;
}

interface SharedBillSplit {
  id: number;
  name: string;
  description: string | null;
  totalAmount: number;
  date: string;
  status: string;
  createdByName: string;
  shareCode: string;
  participants: Participant[];
  progress: {
    paidCount: number;
    totalCount: number;
    totalPaid: number;
    percentPaid: number;
  };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// Payment method buttons with external links
const PaymentMethods = [
  { id: 'venmo', name: 'Venmo', icon: '💸', color: 'bg-blue-500', url: 'https://venmo.com/' },
  { id: 'paypal', name: 'PayPal', icon: '🅿️', color: 'bg-blue-600', url: 'https://paypal.me/' },
  { id: 'zelle', name: 'Zelle', icon: '⚡', color: 'bg-purple-600', url: 'https://www.zellepay.com/' },
  { id: 'cashapp', name: 'Cash App', icon: '💵', color: 'bg-green-500', url: 'https://cash.app/' },
  { id: 'cash', name: 'Cash', icon: '💰', color: 'bg-gray-600', url: null },
];

export default function ShareBillSplit() {
  const { code } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, token } = useAuth();
  
  const [payingParticipant, setPayingParticipant] = useState<Participant | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [identifyName, setIdentifyName] = useState('');
  const [showIdentifyDialog, setShowIdentifyDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [selectedParticipantToJoin, setSelectedParticipantToJoin] = useState<Participant | null>(null);

  // Fetch bill split data
  const { data: billSplit, isLoading, error } = useQuery<SharedBillSplit>({
    queryKey: ['shared-bill', code],
    queryFn: async () => {
      try {
        return await apiFetch(`/api/share/${code}`);
      } catch {
        throw new Error('Bill split not found');
      }
    },
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Pay mutation
  const payMutation = useMutation({
    mutationFn: async ({ participantId, name, paymentMethod }: { participantId: number; name: string; paymentMethod: string }) => {
      try {
        return await apiFetch(`/api/share/${code}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId, name, paymentMethod }),
        });
      } catch (error: any) {
        throw new Error(error?.message || 'Payment failed');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shared-bill', code] });
      setPayingParticipant(null);
      setSelectedPaymentMethod(null);
      setShowSuccessDialog(true);
      toast({
        title: 'Payment Confirmed!',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Payment Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Join split mutation - link participant to logged-in user's account
  const joinMutation = useMutation({
    mutationFn: async ({ participantId }: { participantId: number }) => {
      try {
        return await apiFetch(`/api/share/${code}/join`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ participantId }),
        });
      } catch (error: any) {
        throw new Error(error?.message || 'Failed to join split');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shared-bill', code] });
      queryClient.invalidateQueries({ queryKey: ['/api/bill-splits'] });
      setShowJoinDialog(false);
      setSelectedParticipantToJoin(null);
      toast({
        title: '✅ Joined Successfully!',
        description: 'This split has been added to your account.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Join',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePayClick = (participant: Participant) => {
    setPayingParticipant(participant);
    setIdentifyName(participant.name);
  };

  const handleJoinClick = (participant: Participant) => {
    setSelectedParticipantToJoin(participant);
    setShowJoinDialog(true);
  };

  const handleConfirmJoin = () => {
    if (!selectedParticipantToJoin) return;
    joinMutation.mutate({ participantId: selectedParticipantToJoin.id });
  };

  const handleConfirmPayment = () => {
    if (!payingParticipant || !selectedPaymentMethod) return;
    
    payMutation.mutate({
      participantId: payingParticipant.id,
      name: identifyName || payingParticipant.name,
      paymentMethod: selectedPaymentMethod,
    });
  };

  const handlePaymentMethodClick = (method: typeof PaymentMethods[0]) => {
    setSelectedPaymentMethod(method.id);
    if (method.url) {
      window.open(method.url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/70">Loading bill split...</p>
        </div>
      </div>
    );
  }

  if (error || !billSplit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Bill Split Not Found</h2>
            <p className="text-muted-foreground">
              This link may be invalid or expired. Please ask the bill creator for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allPaid = billSplit.progress.paidCount === billSplit.progress.totalCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
            <Receipt className="h-5 w-5" />
            <span className="font-medium">CODA Bill Split</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{billSplit.name}</h1>
          <p className="text-white/60">
            Created by {billSplit.createdByName} • {formatDate(billSplit.date)}
          </p>
        </div>

        {/* Main Card */}
        <Card className="border-0 shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Total Amount</CardDescription>
                <CardTitle className="text-4xl font-bold">
                  {formatCurrency(billSplit.totalAmount)}
                </CardTitle>
              </div>
              {allPaid ? (
                <Badge className="bg-green-500 text-white text-lg px-4 py-2">
                  <Check className="h-5 w-5 mr-2" />
                  Settled!
                </Badge>
              ) : (
                <Badge variant="outline" className="text-lg px-4 py-2">
                  <Clock className="h-5 w-5 mr-2" />
                  {billSplit.progress.paidCount}/{billSplit.progress.totalCount} Paid
                </Badge>
              )}
            </div>
            {billSplit.description && (
              <p className="text-muted-foreground mt-2">{billSplit.description}</p>
            )}
          </CardHeader>

          <CardContent className="pt-6">
            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Payment Progress</span>
                <span className="font-medium">{billSplit.progress.percentPaid}% Complete</span>
              </div>
              <Progress value={billSplit.progress.percentPaid} className="h-3" />
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(billSplit.progress.totalPaid)} of {formatCurrency(billSplit.totalAmount)} collected
              </p>
            </div>

            {/* Participants */}
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Users className="h-5 w-5" />
                Who's Paying
              </h3>
              <div className="space-y-3">
                {billSplit.participants.map((participant) => (
                  <div 
                    key={participant.id} 
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      participant.isPaid 
                        ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' 
                        : 'bg-card border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Avatar className={`h-12 w-12 ${participant.isPaid ? 'ring-2 ring-green-500' : ''}`}>
                        <AvatarFallback className={participant.isPaid ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}>
                          {participant.isPaid ? <Check className="h-5 w-5" /> : getInitials(participant.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-lg">{participant.name}</p>
                        <p className={`text-sm ${participant.isPaid ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {participant.isPaid ? '✓ Paid' : 'Owes'} {formatCurrency(participant.amountOwed)}
                        </p>
                      </div>
                    </div>
                    
                    {participant.isPaid ? (
                      <Badge className="bg-green-500 text-white px-4 py-2">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Paid
                      </Badge>
                    ) : (
                      <Button 
                        size="lg"
                        onClick={() => handlePayClick(participant)}
                        className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        I'm {participant.name} - Pay Now
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4 bg-muted/30 rounded-b-lg">
            {/* Join to account option for logged-in users */}
            {isAuthenticated ? (
              <div className="w-full p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <UserPlus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Track this in your account</p>
                      <p className="text-sm text-muted-foreground">
                        Add this split to your Bill Split page
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="default"
                    onClick={() => {
                      // Find unpaid participant that matches user or let them choose
                      const unpaidParticipants = billSplit.participants.filter(p => !p.isPaid);
                      if (unpaidParticipants.length === 1) {
                        handleJoinClick(unpaidParticipants[0]);
                      } else if (unpaidParticipants.length > 1) {
                        setShowJoinDialog(true);
                      } else {
                        toast({
                          title: 'Already complete',
                          description: 'All participants have already paid.',
                        });
                      }
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add to My Splits
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-full">
                      <LogIn className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Have a CODA account?</p>
                      <p className="text-xs text-muted-foreground">
                        Sign in to track this split in your account
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/login?redirect=/split/${code}`)}
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </div>
              </div>
            )}
            
            <p className="text-sm text-muted-foreground text-center">
              Click your name above to mark your payment as complete.
              <br />
              The bill creator will be notified instantly!
            </p>
          </CardFooter>
        </Card>

        {/* Powered by */}
        <p className="text-center text-white/40 text-sm">
          Powered by CODA • Split bills with friends easily
        </p>
      </div>

      {/* Payment Method Dialog */}
      <Dialog open={!!payingParticipant} onOpenChange={() => setPayingParticipant(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Confirm Your Payment
            </DialogTitle>
            <DialogDescription>
              {payingParticipant && (
                <>
                  You're paying <strong>{formatCurrency(payingParticipant.amountOwed)}</strong> for "{billSplit.name}"
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Verify Name */}
            <div>
              <Label htmlFor="name">Confirm Your Name</Label>
              <Input
                id="name"
                value={identifyName}
                onChange={(e) => setIdentifyName(e.target.value)}
                placeholder="Enter your name"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must match the name on the bill: <strong>{payingParticipant?.name}</strong>
              </p>
            </div>

            {/* Payment Methods */}
            <div>
              <Label>How did you pay?</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {PaymentMethods.map((method) => (
                  <Button
                    key={method.id}
                    variant={selectedPaymentMethod === method.id ? 'default' : 'outline'}
                    className={`flex items-center justify-start gap-2 h-12 ${
                      selectedPaymentMethod === method.id ? method.color + ' text-white' : ''
                    }`}
                    onClick={() => handlePaymentMethodClick(method)}
                  >
                    <span className="text-lg">{method.icon}</span>
                    <span>{method.name}</span>
                    {method.url && <ExternalLink className="h-3 w-3 ml-auto" />}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Select your payment method. If it has a link, complete the payment there first.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPayingParticipant(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPayment}
              disabled={!selectedPaymentMethod || payMutation.isPending || identifyName.toLowerCase() !== payingParticipant?.name.toLowerCase()}
              className="w-full sm:w-auto"
            >
              {payMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-6">
            <PartyPopper className="h-16 w-16 text-primary mx-auto mb-4" />
            <DialogTitle className="text-2xl mb-2">Payment Confirmed!</DialogTitle>
            <DialogDescription className="text-base">
              Thank you for paying your share. The bill creator has been notified.
            </DialogDescription>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSuccessDialog(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join Split Dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add to Your Account
            </DialogTitle>
            <DialogDescription>
              Select which participant you are to add this split to your Bill Split page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {billSplit?.participants.filter(p => !p.isPaid).map((participant) => (
              <Button
                key={participant.id}
                variant={selectedParticipantToJoin?.id === participant.id ? 'default' : 'outline'}
                className="w-full justify-start h-auto p-4"
                onClick={() => setSelectedParticipantToJoin(participant)}
              >
                <Avatar className="h-10 w-10 mr-3">
                  <AvatarFallback>{getInitials(participant.name)}</AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <p className="font-semibold">{participant.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Owes {formatCurrency(participant.amountOwed)}
                  </p>
                </div>
                {selectedParticipantToJoin?.id === participant.id && (
                  <Check className="h-5 w-5 ml-auto" />
                )}
              </Button>
            ))}
            
            {billSplit?.participants.filter(p => !p.isPaid).length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                All participants have already paid. Nothing to join.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowJoinDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmJoin}
              disabled={!selectedParticipantToJoin || joinMutation.isPending}
              className="w-full sm:w-auto"
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add to My Splits
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
