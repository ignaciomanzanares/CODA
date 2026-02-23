import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCreditScore } from "@/lib/api";
import { useReportData } from "@/contexts/ReportDataContext";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ProgressRing from "./ProgressRing";
import { getCreditScoreStatus, getCircleColor } from "@/lib/creditScore";
import { 
  CreditCard, 
  TrendingUp, 
  Clock, 
  Percent, 
  ChevronRight,
  Sparkles,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

function FactorCard({ 
  icon: Icon, 
  label, 
  value, 
  status 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  status: string;
}) {
  const getStatusColor = (status: string) => {
    if (status === 'Excellent' || status === 'Good') return 'text-green-600 bg-green-50';
    if (status === 'Fair') return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
      <Badge variant="secondary" className={cn("text-xs", getStatusColor(status))}>
        {status}
      </Badge>
    </div>
  );
}

export default function CreditScoreCard() {
  const { getCreditScore, refreshCreditScore } = useCreditScore();
  const { setCreditScore } = useReportData();
  const [showReportBreakdown, setShowReportBreakdown] = useState(false);

  const { data: creditScore, isLoading, error } = useQuery({
    queryKey: ["/api/credit-score"],
    queryFn: getCreditScore
  });

  const mutation = useMutation({
    mutationFn: refreshCreditScore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    },
  });

  useEffect(() => {
    if (creditScore?.score != null) setCreditScore(creditScore.score);
  }, [creditScore?.score, setCreditScore]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-16" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center py-4">
            <Skeleton className="h-36 w-36 rounded-full" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const noScore = creditScore?.score == null;
  if (error || !creditScore || noScore) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Score crediticio
          </CardTitle>
          <CardDescription>Datos del Informe CMF (Deuda Total Vigente)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Info className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-muted-foreground mb-1">
              {noScore && !error ? "Pendiente de Análisis" : null}
              {error ? (error instanceof Error ? error.message : "Error") : null}
              {!creditScore && !error ? "Cargando..." : null}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {noScore && !error
                ? "Sube un Informe de Deudas CMF en la tarjeta Documentos oficiales para obtener tu score (Deuda $0 = perfil saludable)."
                : "Revisa tu conexión o vuelve a intentar."}
            </p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] })}
            >
              {noScore && !error ? "Actualizar" : "Reintentar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const scoreStatus = getCreditScoreStatus(creditScore.score);
  const circleColor = getCircleColor(creditScore.score);
  const progress = (creditScore.score / creditScore.maxScore) * 100;
  
  const getStatusBadgeStyle = () => {
    if (scoreStatus.label === 'Excellent') return 'bg-green-100 text-green-700 border-green-200';
    if (scoreStatus.label === 'Good') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (scoreStatus.label === 'Fair') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  return (
    <>
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Score crediticio
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn("font-semibold", getStatusBadgeStyle())}
          >
            {scoreStatus.label}
          </Badge>
        </div>
        <CardDescription>Resumen de tu salud crediticia</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        {/* Score Ring */}
        <div className="flex justify-center py-2">
          <ProgressRing progress={progress} color={circleColor}>
            <div className="text-4xl font-bold">
              {creditScore.score}
            </div>
            <div className="text-xs text-muted-foreground">
              de {creditScore.maxScore}
            </div>
          </ProgressRing>
        </div>

        {/* Score Change Indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="flex items-center gap-1 text-green-600 text-sm">
            <TrendingUp className="h-4 w-4" />
            <span className="font-medium">+12 pts</span>
          </div>
          <span className="text-xs text-muted-foreground">desde el mes pasado</span>
        </div>

        {/* Factors */}
        <div className="space-y-2 flex-1">
          <FactorCard
            icon={CreditCard}
            label="Historial de pagos"
            value="Todos los pagos a tiempo"
            status={creditScore.paymentHistory}
          />
          <FactorCard
            icon={Percent}
            label="Utilización de crédito"
            value="23% del crédito disponible"
            status={creditScore.utilization}
          />
          <FactorCard
            icon={Clock}
            label="Antigüedad del crédito"
            value="Promedio 4,2 años"
            status={creditScore.ageOfCredit}
          />
        </div>

        {/* Action Button: abre desglose del reporte */}
        <Button
          className="w-full mt-4 group"
          onClick={() => setShowReportBreakdown(true)}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Ver informe completo
          <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardContent>
    </Card>

    {/* Diálogo con el desglose del reporte */}
    <Dialog open={showReportBreakdown} onOpenChange={setShowReportBreakdown}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Desglose del reporte – Score crediticio
          </DialogTitle>
          <DialogDescription>
            Detalle de tu puntaje y factores que lo componen
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <div className="flex justify-center">
            <ProgressRing progress={progress} color={circleColor}>
              <div className="text-4xl font-bold">{creditScore.score}</div>
              <div className="text-xs text-muted-foreground">de {creditScore.maxScore}</div>
            </ProgressRing>
          </div>
          <div className="text-center">
            <Badge variant="outline" className={cn("font-semibold", getStatusBadgeStyle())}>
              {scoreStatus.label}
            </Badge>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Factores</p>
            <FactorCard
              icon={CreditCard}
              label="Historial de pagos"
              value="Todos los pagos a tiempo"
              status={creditScore.paymentHistory}
            />
            <FactorCard
              icon={Percent}
              label="Utilización de crédito"
              value="23% del crédito disponible"
              status={creditScore.utilization}
            />
            <FactorCard
              icon={Clock}
              label="Antigüedad del crédito"
              value="Promedio 4,2 años"
              status={creditScore.ageOfCredit}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
