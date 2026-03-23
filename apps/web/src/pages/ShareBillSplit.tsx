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
import { ROUTES, rutaDividirPublico } from '@/lib/routes';
import { formatCurrency } from '@/lib/utils';
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
  const params = useParams<{ codigo?: string; code?: string }>();
  const code = params.codigo ?? params.code ?? '';
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, token } = useAuth();
  // Montos del backend están en CLP; en el link de pago siempre mostramos CLP (sin conversión a USD)
  const formatAmount = (amount: number) => formatCurrency(amount, 'CLP', { sourceCurrency: 'CLP' });
  
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
        throw new Error('Cuenta dividida no encontrada');
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
        throw new Error(error?.message || 'Error al registrar el pago');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shared-bill', code] });
      setPayingParticipant(null);
      setSelectedPaymentMethod(null);
      setShowSuccessDialog(true);
      toast({
        title: '¡Pago confirmado!',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al registrar el pago',
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
        throw new Error(error?.message || 'Error al unir la cuenta');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shared-bill', code] });
      queryClient.invalidateQueries({ queryKey: ['/api/bill-splits'] });
      setShowJoinDialog(false);
      setSelectedParticipantToJoin(null);
      toast({
        title: '✅ ¡Unido correctamente!',
        description: 'Esta cuenta se ha añadido a tu panel.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al unir',
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
          <p className="text-white/70">Cargando cuenta dividida...</p>
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
            <h2 className="text-xl font-bold mb-2">Cuenta dividida no encontrada</h2>
            <p className="text-muted-foreground">
              Este enlace puede ser inválido o haber caducado. Pide al creador del gasto un nuevo enlace.
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
            <span className="font-medium">CODA Dividir cuenta</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{billSplit.name}</h1>
          <p className="text-white/60">
            Creado por {billSplit.createdByName} • {formatDate(billSplit.date)}
          </p>
        </div>

        {/* Main Card */}
        <Card className="border-0 shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-4xl font-bold">
                  {formatAmount(billSplit.totalAmount)}
                </CardTitle>
              </div>
              {allPaid ? (
                <Badge className="bg-green-500 text-white text-lg px-4 py-2">
                  <Check className="h-5 w-5 mr-2" />
                  ¡Saldado!
                </Badge>
              ) : (
                <Badge variant="outline" className="text-lg px-4 py-2">
                  <Clock className="h-5 w-5 mr-2" />
                  {billSplit.progress.paidCount}/{billSplit.progress.totalCount} pagado
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
                <span className="text-muted-foreground">Progreso del pago</span>
                <span className="font-medium">{billSplit.progress.percentPaid}% completado</span>
              </div>
              <Progress value={billSplit.progress.percentPaid} className="h-3" />
              <p className="text-sm text-muted-foreground mt-2">
                {formatAmount(billSplit.progress.totalPaid)} de {formatAmount(billSplit.totalAmount)} cobrado
              </p>
            </div>

            {/* Participants */}
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Users className="h-5 w-5" />
                Quién paga
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
                          {participant.isPaid ? '✓ Pagado' : 'Debe'} {formatAmount(participant.amountOwed)}
                        </p>
                      </div>
                    </div>
                    
                    {participant.isPaid ? (
                      <Badge className="bg-green-500 text-white px-4 py-2">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Pagado
                      </Badge>
                    ) : (
                      <Button 
                        size="lg"
                        onClick={() => handlePayClick(participant)}
                        className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Soy {participant.name} - Pagar ahora
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
                      <p className="font-medium">Sigue esta cuenta en tu panel</p>
                      <p className="text-sm text-muted-foreground">
                        Añade esta cuenta a tu página Dividir cuenta
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
                          title: 'Ya está completo',
                          description: 'Todos los participantes ya han pagado.',
                        });
                      }
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Añadir a mis cuentas
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
                      <p className="font-medium text-sm">¿Tienes cuenta en CODA?</p>
                      <p className="text-xs text-muted-foreground">
                        Inicia sesión para seguir esta cuenta en tu panel
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      localStorage.setItem('redirectAfterLogin', `${rutaDividirPublico(code)}`);
                      navigate(ROUTES.iniciarSesion);
                    }}
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Iniciar sesión
                  </Button>
                </div>
              </div>
            )}
            
            <p className="text-sm text-muted-foreground text-center">
              Haz clic en tu nombre arriba para marcar tu pago como completado.
              <br />
              ¡El creador del gasto recibirá una notificación al instante!
            </p>
          </CardFooter>
        </Card>

        {/* Powered by */}
        <p className="text-center text-white/40 text-sm">
          Desarrollado por CODA • Divide gastos con amigos fácilmente
        </p>
      </div>

      {/* Payment Method Dialog */}
      <Dialog open={!!payingParticipant} onOpenChange={() => setPayingParticipant(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Confirma tu pago
            </DialogTitle>
            <DialogDescription>
              {payingParticipant && (
                <>
                  Vas a pagar <strong>{formatAmount(payingParticipant.amountOwed)}</strong> por "{billSplit.name}"
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Verify Name */}
            <div>
              <Label htmlFor="name">Confirma tu nombre</Label>
              <Input
                id="name"
                value={identifyName}
                onChange={(e) => setIdentifyName(e.target.value)}
                placeholder="Introduce tu nombre"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Debe coincidir con el nombre en la cuenta: <strong>{payingParticipant?.name}</strong>
              </p>
            </div>

            {/* Payment Methods */}
            <div>
              <Label>¿Cómo pagaste?</Label>
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
                Elige tu método de pago. Si tiene enlace, completa el pago allí primero.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPayingParticipant(null)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmPayment}
              disabled={!selectedPaymentMethod || payMutation.isPending || identifyName.toLowerCase() !== payingParticipant?.name.toLowerCase()}
              className="w-full sm:w-auto"
            >
              {payMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirmar pago
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
            <DialogTitle className="text-2xl mb-2">¡Pago confirmado!</DialogTitle>
            <DialogDescription className="text-base">
              Gracias por pagar tu parte. El creador del gasto ha sido notificado.
            </DialogDescription>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSuccessDialog(false)} className="w-full">
              Listo
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
              Añadir a tu cuenta
            </DialogTitle>
            <DialogDescription>
              Indica qué participante eres para añadir esta cuenta a tu página Dividir cuenta.
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
                    Debe {formatAmount(participant.amountOwed)}
                  </p>
                </div>
                {selectedParticipantToJoin?.id === participant.id && (
                  <Check className="h-5 w-5 ml-auto" />
                )}
              </Button>
            ))}
            
            {billSplit?.participants.filter(p => !p.isPaid).length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                Todos los participantes ya han pagado. Nada que unir.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowJoinDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmJoin}
              disabled={!selectedParticipantToJoin || joinMutation.isPending}
              className="w-full sm:w-auto"
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Añadiendo...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Añadir a mis cuentas
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
