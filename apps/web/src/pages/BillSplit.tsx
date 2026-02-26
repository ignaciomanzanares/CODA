import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Plus, Users, DollarSign, Check, Clock, Send, 
  CheckCircle, CreditCard, Trash2, Receipt, 
  UserPlus, Home, Utensils, Car, Plane, Zap, 
  MoreHorizontal, RefreshCw, X,
  Percent, Hash, Equal, ArrowUpRight, ArrowDownLeft,
  Copy, Share2, Camera
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useApi } from "@/lib/api";
import type { BillSplit, BillSplitParticipant } from "@/types";
import { useAuth } from "@/lib/auth";
import { generateDemoBillSplits } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import PaymentDialog from "@/components/PaymentDialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

// Montos guardados en CLP; mostrar en la moneda elegida (CLP por defecto)
function formatAmount(amount: number, currency: "CLP" | "USD") {
  return formatCurrency(amount, currency, { sourceCurrency: "CLP" });
}

// Extended types
type BillSplitParticipantWithUser = BillSplitParticipant & {
  isCurrentUser?: boolean;
  userName?: string;
};

type BillSplitWithParticipants = BillSplit & {
  participants: BillSplitParticipantWithUser[];
  userRole?: 'creator' | 'participant' | 'none';
  createdByName?: string;
  paidByName?: string;
  category?: string;
  shareCode?: string;
};

// Expense categories with icons and colors
const EXPENSE_CATEGORIES = [
  { id: "food", label: "Comida y restaurantes", icon: Utensils, color: "bg-orange-500" },
  { id: "travel", label: "Viajes", icon: Plane, color: "bg-blue-500" },
  { id: "transport", label: "Transporte", icon: Car, color: "bg-green-500" },
  { id: "utilities", label: "Servicios", icon: Zap, color: "bg-yellow-500" },
  { id: "rent", label: "Arriendo", icon: Home, color: "bg-purple-500" },
  { id: "general", label: "Otros", icon: Receipt, color: "bg-gray-500" },
];

const getCategoryInfo = (categoryId: string) => {
  return EXPENSE_CATEGORIES.find(c => c.id === categoryId) || EXPENSE_CATEGORIES[5];
};

// Form schemas
const participantSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().optional().refine((val) => {
    if (!val || val === "") return true;
    return z.string().email().safeParse(val).success;
  }, { message: "Correo no válido" }),
  shareValue: z.string().optional(),
});

const billSplitFormSchema = z.object({
  name: z.string().optional(),
  totalAmount: z.string().min(1, "El monto es obligatorio"),
  description: z.string().optional(),
  category: z.string().default("general"),
  date: z.string().optional(),
  splitType: z.enum(["equal"]).default("equal"),
  participants: z.array(participantSchema).min(1, "Se requiere al menos un participante"),
});

type BillSplitFormValues = z.infer<typeof billSplitFormSchema>;

// Helpers
const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// Balance Summary Card
function BalanceSummaryCard({ 
  totalOwed, 
  totalOwedToYou,
  currency,
}: {
  totalOwed: number; 
  totalOwedToYou: number;
  currency: 'CLP' | 'USD';
}) {
  const netBalance = totalOwedToYou - totalOwed;
  
  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold opacity-90">Tu saldo</h3>
          <Badge variant="outline" className="border-white/20 text-white">
            {netBalance >= 0 ? '¡Todo al día!' : 'Saldar'}
          </Badge>
        </div>
        
        <div className="text-center mb-6">
          <p className={`text-4xl font-bold ${netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {netBalance < 0 && '-'}{formatAmount(Math.abs(netBalance), currency)}
          </p>
          <p className="text-sm opacity-70 mt-1">
            {netBalance >= 0 ? 'Estás en positivo' : 'En total, debes dinero'}
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="h-4 w-4 text-red-400" />
              <span className="text-sm opacity-70">Debes</span>
            </div>
            <p className="text-xl font-semibold text-red-400">{formatAmount(totalOwed, currency)}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownLeft className="h-4 w-4 text-green-400" />
              <span className="text-sm opacity-70">Te deben</span>
            </div>
            <p className="text-xl font-semibold text-green-400">{formatAmount(totalOwedToYou, currency)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Friend Balance Row
function FriendBalanceRow({ 
  name, 
  balance,
  currency,
  onSettleUp,
  onRemind
}: { 
  name: string; 
  balance: number;
  currency: 'CLP' | 'USD';
  onSettleUp: () => void;
  onRemind: () => void;
}) {
  const isOwed = balance > 0;
  const isOwing = balance < 0;

  return (
    <div className="flex items-center justify-between py-4 px-4 hover:bg-muted/50 rounded-lg transition-colors group">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback className={`text-sm font-medium ${isOwed ? 'bg-green-100 text-green-700' : isOwing ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{name}</p>
          <p className={`text-sm ${isOwed ? 'text-green-600' : isOwing ? 'text-red-600' : 'text-muted-foreground'}`}>
            {isOwed ? `te debe ${formatAmount(balance, currency)}` : 
             isOwing ? `le debes ${formatAmount(balance, currency)}` : 
             'al día'}
          </p>
        </div>
      </div>
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {isOwed && (
          <Button variant="ghost" size="sm" onClick={onRemind}>
            <Send className="h-4 w-4 mr-1" />
            Recordar
          </Button>
        )}
        {balance !== 0 && (
          <Button variant="outline" size="sm" onClick={onSettleUp}>
            Saldar
          </Button>
        )}
      </div>
    </div>
  );
}

// Expense Card
function ExpenseCard({ 
  expense, 
  currentUserId,
  currency,
  onViewDetails,
  onDelete
}: { 
  expense: BillSplitWithParticipants;
  currentUserId?: string;
  currency: 'CLP' | 'USD';
  onViewDetails: () => void;
  onDelete: () => void;
}) {
  const categoryInfo = getCategoryInfo(expense.category || 'general');
  const CategoryIcon = categoryInfo.icon;
  const paidCount = expense.participants?.filter(p => p.isPaid).length || 0;
  const totalCount = expense.participants?.length || 0;
  const isCreator = expense.createdBy === currentUserId;
  const userParticipant = expense.participants?.find(p => p.userId === currentUserId);
  const progress = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;
  
  return (
    <Card 
      className={`hover:shadow-lg transition-all cursor-pointer border-l-4 ${
        expense.status === 'settled' ? 'border-l-green-500 bg-green-50/30' : 'border-l-transparent'
      }`}
      onClick={onViewDetails}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`p-2.5 rounded-xl ${categoryInfo.color} flex-shrink-0`}>
              <CategoryIcon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{expense.name}</h3>
                {expense.status === 'settled' && (
                  <Badge className="bg-green-100 text-green-700 border-0">
                    <Check className="h-3 w-3 mr-1" />
                    Saldado
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {expense.date && !isNaN(new Date(expense.date).getTime()) 
                  ? new Date(expense.date).toLocaleDateString('es-CL', { month: 'short', day: 'numeric' })
                  : 'Sin fecha'}
                {expense.createdByName && ` • Añadido por ${expense.createdByName}`}
              </p>
              
              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{paidCount} de {totalCount} pagaron</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              {/* Participants */}
              <div className="flex items-center gap-2 mt-3">
                <div className="flex -space-x-2">
                  {expense.participants?.slice(0, 4).map((p) => (
                    <Avatar key={p.id} className="h-7 w-7 border-2 border-background">
                      <AvatarFallback className={`text-xs ${p.isPaid ? 'bg-green-100 text-green-700' : 'bg-muted'}`}>
                        {getInitials(p.name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {(expense.participants?.length || 0) > 4 && (
                    <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                      <span className="text-xs font-medium">+{(expense.participants?.length || 0) - 4}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold">{formatAmount(parseFloat(String(expense.totalAmount)) || 0, currency)}</p>
            {/* Show "You owe" badge only if user is a participant in someone ELSE's split and hasn't paid */}
            {userParticipant && !userParticipant.isPaid && !isCreator && expense.status !== 'settled' && (
              <Badge variant="destructive" className="mt-1">
                Debes {formatAmount(parseFloat(String(userParticipant.amountOwed)) || 0, currency)}
              </Badge>
            )}
            {isCreator && expense.status !== 'settled' && paidCount < totalCount && (
              <Badge variant="outline" className="mt-1">
                <Clock className="h-3 w-3 mr-1" />
                Pendiente
              </Badge>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 mt-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetails(); }}>
                  Ver detalle
                </DropdownMenuItem>
                {isCreator && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-red-600"
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Main Component
export default function BillSplit() {
  const [ready, setReady] = useState(false);
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { currency: contextCurrency } = useCurrency();
  const currency: "CLP" | "USD" = contextCurrency === "USD" ? "USD" : "CLP";
  const { getBillSplits, createBillSplit, markParticipantAsPaid, deleteBillSplit, scanExpense } = useApi();
  const [activeTab, setActiveTab] = useState("expenses");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSettleDialogOpen, setIsSettleDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<BillSplitWithParticipants | null>(null);
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    isOpen: boolean;
    billSplit?: BillSplitWithParticipants;
    participant?: BillSplitParticipantWithUser;
  }>({ isOpen: false });
  const [isScanningBill, setIsScanningBill] = useState(false);
  const billScanInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  // Handle email invitation highlights
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    if (highlightId) {
      setHighlightedBillId(highlightId);
      setTimeout(() => setHighlightedBillId(null), 10000);
    }
  }, []);

  const [demoBillSplits, setDemoBillSplits] = useState<BillSplitWithParticipants[]>([]);

  useEffect(() => {
    if (isAuthenticated || !ready) return;
    const id = requestAnimationFrame(() => {
      setDemoBillSplits(generateDemoBillSplits());
    });
    return () => cancelAnimationFrame(id);
  }, [isAuthenticated, ready]);

  const { data: realBillSplits = [], isLoading, isError } = useQuery<BillSplitWithParticipants[]>({
    queryKey: ["/api/bill-splits"],
    queryFn: getBillSplits,
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  const billSplits = isAuthenticated ? realBillSplits : demoBillSplits;

  // Normalize API response so balance calc always has amountOwed (number), isPaid (bool), createdBy, userRole
  const normalizedSplits: BillSplitWithParticipants[] = (billSplits || []).map((split) => {
    const createdBy = split.createdBy ?? (split as any).created_by;
    const userRole = split.userRole ?? (split as any).user_role;
    const participants = (split.participants ?? []).map((p: any, i: number) => ({
      ...p,
      userId: p.userId ?? p.user_id,
      amountOwed: typeof p.amountOwed === 'number' ? p.amountOwed : parseFloat(String(p.amountOwed ?? p.amount_owed ?? 0)) || 0,
      isPaid: Boolean(p.isPaid ?? p.is_paid),
      isCurrentUser: Boolean(p.isCurrentUser ?? p.is_current_user),
    }));
    return { ...split, createdBy, userRole, participants };
  });

  // Show both 'active' and 'pending' statuses as active expenses
  const activeExpenses = billSplits.filter(s => s.status === 'active' || s.status === 'pending' || !s.status);
  const settledExpenses = billSplits.filter(s => s.status === 'settled' || s.status === 'fully_paid');

  const updateBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
    queryClient.refetchQueries({ queryKey: ["/api/bill-splits"] });
  }, [queryClient]);

  // Calculate balances - count all unpaid amounts from bill splits you created
  const calculateBalances = (splits: BillSplitWithParticipants[]) => {
    const balances: Record<string, { name: string; balance: number }> = {};
    const currentUserId = user?.userId ?? null;

    (splits || []).forEach((split) => {
      if (split.status === 'settled' || split.status === 'fully_paid') return;

      // Creator: match by id or by role (API sets userRole)
      const isCreator =
        (currentUserId != null && String(split.createdBy) === String(currentUserId)) ||
        split.userRole === 'creator';

      if (isCreator) {
        (split.participants || []).forEach((p: BillSplitParticipantWithUser, idx: number) => {
          const isCurrentUserParticipant =
            (currentUserId != null && String(p.userId) === String(currentUserId)) ||
            Boolean(p.isCurrentUser) ||
            (idx === 0 && isCreator);
          if (isCurrentUserParticipant) return;

          const isPaid = Boolean(p.isPaid ?? (p as { is_paid?: number }).is_paid);
          if (!isPaid) {
            const rawOwed = p.amountOwed ?? (p as { amount_owed?: number }).amount_owed;
            const amount = Number(rawOwed) || parseFloat(String(rawOwed ?? 0)) || 0;
            if (amount <= 0) return;
            const key = p.userId || p.email || `p-${p.id}`;
            if (!balances[key]) balances[key] = { name: p.name || 'Sin nombre', balance: 0 };
            balances[key].balance += amount;
          }
        });
      }

      const ourParticipation = (split.participants || []).find(
        (p: BillSplitParticipantWithUser) =>
          (currentUserId != null && String(p.userId) === String(currentUserId)) || Boolean(p.isCurrentUser)
      );
      if (ourParticipation && !Boolean(ourParticipation.isPaid ?? (ourParticipation as { is_paid?: number }).is_paid) && !isCreator) {
        const creatorKey = String(split.createdBy ?? 'creator');
        const rawOwed = ourParticipation.amountOwed ?? (ourParticipation as { amount_owed?: number }).amount_owed;
        const amount = Number(rawOwed) || parseFloat(String(rawOwed ?? 0)) || 0;
        if (!balances[creatorKey]) balances[creatorKey] = { name: split.createdByName || 'Creador del gasto', balance: 0 };
        balances[creatorKey].balance -= amount;
      }
    });

    return Object.entries(balances).map(([userId, data]) => ({ userId, ...data }));
  };

  // Calculate totals directly from bill splits for accuracy
  const calculateTotals = (splits: BillSplitWithParticipants[]) => {
    let youAreOwed = 0;
    let youOwe = 0;
    const currentUserId = user?.userId ?? null;

    (splits || []).forEach((split) => {
      if (split.status === 'settled' || split.status === 'fully_paid') return;

      const isCreator =
        (currentUserId != null && String(split.createdBy) === String(currentUserId)) ||
        split.userRole === 'creator';

      if (isCreator) {
        (split.participants || []).forEach((p: BillSplitParticipantWithUser, idx: number) => {
          const isCurrentUserParticipant =
            (currentUserId != null && String(p.userId) === String(currentUserId)) ||
            Boolean(p.isCurrentUser) ||
            (idx === 0 && isCreator);
          if (isCurrentUserParticipant) return;
          if (!Boolean(p.isPaid ?? (p as { is_paid?: number }).is_paid)) {
            const rawOwed = p.amountOwed ?? (p as { amount_owed?: number }).amount_owed;
            youAreOwed += Number(rawOwed) || parseFloat(String(rawOwed ?? 0)) || 0;
          }
        });
      }

      if (!isCreator) {
        const myParticipation = (split.participants || []).find(
          (p: BillSplitParticipantWithUser) =>
            (currentUserId != null && String(p.userId) === String(currentUserId)) || Boolean(p.isCurrentUser)
        );
        if (myParticipation && !Boolean(myParticipation.isPaid ?? (myParticipation as { is_paid?: number }).is_paid)) {
          const rawOwed = myParticipation.amountOwed ?? (myParticipation as { amount_owed?: number }).amount_owed;
          youOwe += Number(rawOwed) || parseFloat(String(rawOwed ?? 0)) || 0;
        }
      }
    });

    return { youAreOwed, youOwe };
  };

  const { youAreOwed, youOwe } = calculateTotals(normalizedSplits);

  const userBalances = calculateBalances(normalizedSplits);
  const totalYouOwe = userBalances.filter(b => b.balance < 0).reduce((sum, b) => sum + Math.abs(b.balance), 0);
  const totalOwedToYou = userBalances.filter(b => b.balance > 0).reduce((sum, b) => sum + b.balance, 0);

  // Mutations
  const createBillSplitMutation = useMutation({
    mutationFn: (billSplit: BillSplitFormValues) => {
      const totalAmountClp = Math.round(parseFloat(billSplit.totalAmount) || 0);
      const creatorName = (user as any)?.firstName || (user as any)?.username || (user as any)?.name || (user as any)?.email || 'Me';
      const creatorEmail = (user as any)?.email || '';
      const participantsList = Array.isArray(billSplit.participants) ? billSplit.participants : [];
      const allParticipants = [
        { name: creatorName, email: creatorEmail, shareValue: undefined, isCreator: true },
        ...participantsList.map(p => ({ ...p, isCreator: false }))
      ];
      const perPerson = allParticipants.length > 0 ? totalAmountClp / allParticipants.length : 0;
      const participantAmounts = allParticipants.map(() => perPerson);

      return createBillSplit({
        name: billSplit.name?.trim() || 'Gasto compartido',
        totalAmount: totalAmountClp,
        description: undefined,
        category: billSplit.category,
        date: new Date(),
        participants: allParticipants.map((p, i) => ({
          userId: p.isCreator ? (user?.userId ?? null) : null,
          name: p.name,
          email: p.email,
          amountOwed: participantAmounts[i].toFixed(2),
          isPaid: p.isCreator,
        }))
      });
    },
    onSuccess: async (data: BillSplitWithParticipants) => {
      // Actualizar caché con la respuesta del POST (misma forma que GET) para que el saldo se actualice al instante
      const shape = {
        ...data,
        createdBy: data.createdBy ?? (data as any).created_by,
        userRole: (data as any).userRole ?? 'creator',
        participants: (data.participants ?? []).map((p: any) => ({
          ...p,
          amountOwed: typeof p.amountOwed === 'number' ? p.amountOwed : parseFloat(String(p.amountOwed ?? p.amount_owed ?? 0)) || 0,
          isPaid: Boolean(p.isPaid ?? p.is_paid),
          isCurrentUser: Boolean(p.isCurrentUser ?? p.is_current_user),
        })),
      };
      queryClient.setQueryData<BillSplitWithParticipants[]>(["/api/bill-splits"], (prev) => {
        const list = prev ?? [];
        if (data?.id != null && !list.some((b) => String(b.id) === String(data.id))) {
          return [...list, shape];
        }
        return list;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bill-splits"] });
      queryClient.refetchQueries({ queryKey: ["/api/bill-splits"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: ({ billSplitId, participantId, amountPaid }: { billSplitId: string; participantId: string; amountPaid?: number }) => {
      return markParticipantAsPaid(billSplitId, participantId, amountPaid);
    },
    onSuccess: () => {
      updateBalances();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteSplitMutation = useMutation({
    mutationFn: (billSplitId: string) => deleteBillSplit(billSplitId),
    onSuccess: () => {
      updateBalances();
      setSelectedExpense(null);
    },
  });

  const handleMarkAsPaid = (billSplitId: string, participantId: string, amountPaid?: number) => {
    if (isAuthenticated) {
      markAsPaidMutation.mutate({ billSplitId, participantId, amountPaid });
    }
  };

  const handleDeleteSplit = (billSplitId: string) => {
    if (isAuthenticated && confirm('¿Eliminar este gasto? No se puede deshacer.')) {
      deleteSplitMutation.mutate(billSplitId);
    }
  };

  const handleBillScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAuthenticated) return;
    e.target.value = "";
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Formato no válido", description: "Usa una imagen JPG o PNG.", variant: "destructive" });
      return;
    }
    setIsScanningBill(true);
    try {
      const result = await scanExpense(file);
      form.setValue("totalAmount", String(result.amount));
      if (result.merchant && result.merchant !== "Desconocido") {
        form.setValue("name", result.merchant);
      }
      toast({
        title: "Boleta escaneada",
        description: `Monto: ${formatAmount(result.amount, currency)}${result.merchant !== "Desconocido" ? ` · ${result.merchant}` : ""}`,
      });
    } catch (err) {
      toast({
        title: "Error al escanear",
        description: err instanceof Error ? err.message : "No se pudo leer la imagen.",
        variant: "destructive",
      });
    } finally {
      setIsScanningBill(false);
    }
  };

  // Form
  const form = useForm<BillSplitFormValues>({
    resolver: zodResolver(billSplitFormSchema),
    defaultValues: {
      name: "",
      totalAmount: "",
      description: "",
      category: "general",
      date: new Date().toISOString().split('T')[0],
      splitType: "equal",
      participants: [{ name: "", email: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "participants",
  });

  const watchParticipants = form.watch("participants");
  const watchAmount = form.watch("totalAmount");

  const onSubmit = (values: BillSplitFormValues) => {
    createBillSplitMutation.mutate(values);
  };

  const showLoading = authLoading || (isAuthenticated && isLoading);

  if (!ready) {
    return (
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dividir cuenta</h1>
        <p className="text-muted-foreground">Registra y salda gastos compartidos</p>
        <div className="mt-6 h-24 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {showLoading ? (
        <>
          <div className="h-8 bg-muted rounded animate-pulse w-48" />
          <div className="h-48 bg-muted rounded animate-pulse" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </>
      ) : (
        <>
      {isAuthenticated && isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-200">
          No se pudieron cargar tus gastos compartidos. Revisa la conexión o intenta más tarde.
        </div>
      )}
      {!isAuthenticated && (
        <SignInBanner 
          title="Divide cuentas como un pro"
          description="Registra gastos compartidos, salda deudas fácilmente y mantén la amistad sin líos de dinero. ¡Inicia sesión para empezar!"
          actionText="Iniciar sesión para comenzar"
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dividir cuenta</h1>
          <p className="text-muted-foreground">Registra y salda gastos compartidos</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            className="flex-1 sm:flex-none"
            onClick={() => setIsSettleDialogOpen(true)} 
            disabled={!isAuthenticated || userBalances.length === 0}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Saldar
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!isAuthenticated} className="flex-1 sm:flex-none">
                <Plus className="w-4 h-4 mr-2" />
                Añadir gasto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Añadir un gasto</DialogTitle>
                <DialogDescription>
                  Divide una cuenta con amigos
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Category */}
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoría</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {EXPENSE_CATEGORIES.map(cat => {
                            const Icon = cat.icon;
                            return (
                              <Button
                                key={cat.id}
                                type="button"
                                variant={field.value === cat.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => field.onChange(cat.id)}
                                className="gap-1.5"
                              >
                                <Icon className="h-4 w-4" />
                                {cat.label}
                              </Button>
                            );
                          })}
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Amount - CLP */}
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    className="hidden"
                    ref={billScanInputRef}
                    onChange={handleBillScan}
                  />
                  <FormField
                    control={form.control}
                    name="totalAmount"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-2">
                          <FormLabel>Monto (CLP)</FormLabel>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={!isAuthenticated || isScanningBill}
                            onClick={() => billScanInputRef.current?.click()}
                          >
                            <Camera className="h-4 w-4" />
                            {isScanningBill ? "Escaneando..." : "Escanear boleta"}
                          </Button>
                        </div>
                        <FormControl>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="0" className="pl-9" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Participants */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <FormLabel>Dividir con</FormLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => append({ name: "", email: "" })}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Añadir
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex gap-2 items-start">
                          <Avatar className="h-9 w-9 mt-0.5 flex-shrink-0">
                            <AvatarFallback className="text-xs">{index + 1}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <FormField
                              control={form.control}
                              name={`participants.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="Nombre" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`participants.${index}.email`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="Correo (opcional)" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              className="h-9 w-9 flex-shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview - equal split only */}
                  {watchAmount && watchParticipants.length > 0 && (
                    <Card className="bg-muted/50 border-dashed">
                      <CardContent className="p-4">
                        <p className="text-sm font-medium mb-2">Vista previa del reparto (igual)</p>
                        <div className="space-y-1.5">
                          {(() => {
                            const total = parseFloat(watchAmount || '0') || 0;
                            const creatorName = (user as any)?.firstName || (user as any)?.username || (user as any)?.name || 'Tú';
                            const participantsList = Array.isArray(watchParticipants) ? watchParticipants : [];
                            const totalParticipantCount = Math.max(1, participantsList.length + 1);
                            const perPerson = total / totalParticipantCount;
                            const allNames = [`${creatorName} (tú)`, ...participantsList.map((p) => p.name || 'Persona')];
                            return allNames.map((name, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className={i === 0 ? "text-primary font-medium" : "text-muted-foreground"}>{name || `Persona ${i + 1}`}</span>
                                <span className="font-medium">{formatAmount(perPerson, currency)}</span>
                              </div>
                            ));
                          })()}
                          <Separator className="my-2" />
                          <div className="flex justify-between text-sm font-medium">
                            <span>Total</span>
                            <span>{formatAmount(parseFloat(watchAmount || '0'), currency)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createBillSplitMutation.isPending}
                  >
                    {createBillSplitMutation.isPending ? "Creando..." : "Añadir gasto"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Balance Summary - use calculated totals */}
      <BalanceSummaryCard totalOwed={youOwe} totalOwedToYou={youAreOwed} currency={currency} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expenses" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Gastos</span>
            {activeExpenses.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">{activeExpenses.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Balances</span>
            {userBalances.filter(b => b.balance !== 0).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">{userBalances.filter(b => b.balance !== 0).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Check className="h-4 w-4" />
            <span className="hidden sm:inline">Saldados</span>
          </TabsTrigger>
        </TabsList>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          {activeExpenses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Receipt className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No hay gastos activos</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Añade tu primer gasto compartido y empieza a llevar quién debe qué
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)} disabled={!isAuthenticated}>
                  <Plus className="w-4 h-4 mr-2" />
                  Añadir gasto
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeExpenses.map(expense => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  currentUserId={user?.userId}
                  currency={currency}
                  onViewDetails={() => setSelectedExpense(expense)}
                  onDelete={() => handleDeleteSplit(String(expense.id))}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Balances Tab */}
        <TabsContent value="friends" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Saldos con amigos</CardTitle>
              <CardDescription>Quién te debe y a quién debes</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {userBalances.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">¡Todo al día!</h3>
                  <p className="text-muted-foreground">
                    No tienes saldos pendientes
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {userBalances.map(balance => (
                    <FriendBalanceRow
                      key={balance.userId}
                      name={balance.name}
                      balance={balance.balance}
                      currency={currency}
                      onSettleUp={() => setIsSettleDialogOpen(true)}
                      onRemind={() => alert('¡Recordatorio enviado!')}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {settledExpenses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Clock className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Aún no hay historial</h3>
                <p className="text-muted-foreground">
                  Los gastos saldados aparecerán aquí
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {settledExpenses.map(expense => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  currentUserId={user?.userId}
                  currency={currency}
                  onViewDetails={() => setSelectedExpense(expense)}
                  onDelete={() => handleDeleteSplit(String(expense.id))}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Expense Detail Dialog */}
      <Dialog open={!!selectedExpense} onOpenChange={() => setSelectedExpense(null)}>
        <DialogContent className="max-w-lg">
          {selectedExpense && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const cat = getCategoryInfo(selectedExpense.category || 'general');
                    const Icon = cat.icon;
                    return (
                      <div className={`p-3 rounded-xl ${cat.color}`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                    );
                  })()}
                  <div>
                    <DialogTitle className="text-xl">{selectedExpense.name}</DialogTitle>
                    <DialogDescription>
                      {selectedExpense.date && !isNaN(new Date(selectedExpense.date).getTime())
                        ? new Date(selectedExpense.date).toLocaleDateString('en-US', { 
                            weekday: 'long',
                            month: 'long', 
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Sin fecha'}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                <div className="text-center py-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Monto total</p>
                  <p className="text-4xl font-bold">{formatAmount(parseFloat(String(selectedExpense.totalAmount)) || 0, currency)}</p>
                  {selectedExpense.description && (
                    <p className="text-sm text-muted-foreground mt-2">{selectedExpense.description}</p>
                  )}
                </div>

                {/* Share Link Section */}
                {selectedExpense.shareCode && (
                  <div className="border rounded-lg p-4 bg-gradient-to-r from-primary/5 to-primary/10">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Share2 className="h-4 w-4 text-primary" />
                        Compartir con amigos
                      </h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Envía este enlace a tus amigos para que vean la cuenta y paguen su parte
                    </p>
                    <div className="flex gap-2">
                      <Input 
                        value={`${window.location.origin}/split/${selectedExpense.shareCode}`}
                        readOnly
                        className="text-sm font-mono bg-background"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/split/${selectedExpense.shareCode}`);
                          toast({
                            title: "¡Enlace copiado!",
                            description: "Enlace copiado al portapapeles",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Participantes
                  </h4>
                  <div className="space-y-2">
                    {selectedExpense.participants?.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className={p.isPaid ? 'bg-green-100 text-green-700' : 'bg-muted'}>
                              {getInitials(p.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {p.isPaid ? `Pagado ${formatAmount(parseFloat(String(p.amountPaid || p.amountOwed)) || 0, currency)}` : `Debe ${formatAmount(parseFloat(String(p.amountOwed)) || 0, currency)}`}
                            </p>
                          </div>
                        </div>
                        {p.isPaid ? (
                          <Badge className="bg-green-100 text-green-700 border-0">
                            <Check className="h-3 w-3 mr-1" />
                            Pagado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            Pendiente
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSelectedExpense(null)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Settle Up Dialog */}
      <Dialog open={isSettleDialogOpen} onOpenChange={setIsSettleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle Up</DialogTitle>
            <DialogDescription>
              Elige un método de pago para saldar con un amigo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Venmo', color: 'bg-blue-500', url: 'https://venmo.com' },
                { name: 'PayPal', color: 'bg-blue-600', url: 'https://paypal.com' },
                { name: 'Zelle', color: 'bg-purple-500', url: 'https://zellepay.com' },
                { name: 'Cash App', color: 'bg-green-500', url: 'https://cash.app' },
              ].map(method => (
                <Button 
                  key={method.name}
                  variant="outline" 
                  className="h-auto py-4 justify-start"
                  onClick={() => window.open(method.url, '_blank')}
                >
                  <div className={`w-3 h-3 rounded-full ${method.color} mr-3`} />
                  {method.name}
                </Button>
              ))}
            </div>
            <Separator />
            <Button variant="secondary" className="w-full" onClick={() => setIsSettleDialogOpen(false)}>
              <CreditCard className="h-4 w-4 mr-2" />
              Registrar pago en efectivo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      {paymentDialog.isOpen && paymentDialog.billSplit && paymentDialog.participant && (
        <PaymentDialog
          isOpen={paymentDialog.isOpen}
          onClose={() => setPaymentDialog({ isOpen: false })}
          amount={parseFloat(String(paymentDialog.participant.amountOwed)).toFixed(2)}
          participantName={paymentDialog.participant.name}
          billName={paymentDialog.billSplit.name}
          creatorName={paymentDialog.billSplit.createdByName || 'Creador del gasto'}
          onPaymentComplete={() => {
            if (paymentDialog.billSplit && paymentDialog.participant) {
              handleMarkAsPaid(
                String(paymentDialog.billSplit.id),
                String(paymentDialog.participant.id),
                parseFloat(String(paymentDialog.participant.amountOwed))
              );
            }
          }}
        />
      )}
        </>
      )}
    </div>
  );
}
