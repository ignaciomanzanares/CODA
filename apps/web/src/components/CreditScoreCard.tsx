import { useState, useEffect, useRef } from "react";
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
  Clock,
  Percent,
  ChevronRight,
  Sparkles,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Analytics, creditScoreRangeLabel } from "@/lib/analytics";

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
    const s = status.toLowerCase();
    if (s === 'excellent' || s === 'good' || s === 'excelente' || s === 'muy bueno' || s === 'bueno') return 'text-green-600 bg-green-50';
    if (s === 'fair' || s === 'regular') return 'text-yellow-600 bg-yellow-50';
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
  const scoreViewTracked = useRef(false);

  const { data: rawData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/credit-score"],
    queryFn: async () => {
      const res = await getCreditScore();
      return res;
    },
  });

  const mutation = useMutation({
    mutationFn: refreshCreditScore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    },
  });

  const handleActualizar = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    refetch();
  };

  const creditScore = (rawData != null && typeof rawData === "object" && "score" in rawData)
    ? rawData
    : null;

  useEffect(() => {
    if (creditScore?.score != null) setCreditScore(creditScore.score);
  }, [creditScore?.score, setCreditScore]);

  useEffect(() => {
    const s = creditScore?.score;
    if (typeof s === "number" && !Number.isNaN(s) && !scoreViewTracked.current) {
      scoreViewTracked.current = true;
      Analytics.scoreViewed(creditScoreRangeLabel(s));
    }
  }, [creditScore?.score]);

  if (isLoading || isFetching) {
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

  const noScore = creditScore == null || creditScore.score == null || typeof creditScore.score !== "number";
  const isServerError = !!error;
  const invalidData = rawData != null && (creditScore == null || noScore);

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
              {invalidData && "Sin datos disponibles"}
              {noScore && !error && !invalidData && "Pendiente de Análisis"}
              {error && (error instanceof Error ? error.message : String(error))}
              {!rawData && !error && "Cargando..."}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {isServerError
                ? "Hubo un fallo en el servidor al obtener el score. Comprueba que estés autenticado y vuelve a intentar."
                : invalidData
                  ? "El servidor respondió pero sin score válido. Sube un Informe CMF o pulsa Actualizar."
                  : noScore && !error
                    ? "Sube un Informe de Deudas CMF en la tarjeta Documentos oficiales para obtener tu score (Deuda $0 = perfil saludable)."
                    : !rawData && !error
                      ? ""
                      : "Revisa tu conexión o vuelve a intentar."}
            </p>
            <Button
              variant="outline"
              onClick={handleActualizar}
              disabled={isFetching}
            >
              {isFetching ? "Actualizando…" : noScore || invalidData ? "Actualizar" : "Reintentar"}
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
    const l = scoreStatus.label.toLowerCase();
    if (l === 'excelente' || l === 'excellent') return 'bg-green-100 text-green-700 border-green-200';
    if (l === 'muy bueno' || l === 'bueno' || l === 'good' || l === 'very good') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (l === 'regular' || l === 'fair') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
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
            <div className="text-score-value font-bold">
              {creditScore.score}
            </div>
            <div className="text-xs text-muted-foreground">
              de {creditScore.maxScore}
            </div>
          </ProgressRing>
        </div>

        {/* Factors */}
        <div className="space-y-2 flex-1">
          <FactorCard
            icon={CreditCard}
            label="Historial de pagos"
            value={creditScore.paymentHistory || "—"}
            status={creditScore.paymentHistory}
          />
          <FactorCard
            icon={Percent}
            label="Utilización de crédito"
            value={creditScore.utilization || "—"}
            status={creditScore.utilization}
          />
          <FactorCard
            icon={Clock}
            label="Antigüedad del crédito"
            value={creditScore.ageOfCredit || "—"}
            status={creditScore.ageOfCredit}
          />
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center mt-2">
          Score calculado desde tu Informe de Deudas CMF. No garantiza aprobación de productos.
        </p>

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
              <div className="text-score-value font-bold">{creditScore.score}</div>
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
              value={creditScore.paymentHistory || "—"}
              status={creditScore.paymentHistory}
            />
            <FactorCard
              icon={Percent}
              label="Utilización de crédito"
              value={creditScore.utilization || "—"}
              status={creditScore.utilization}
            />
            <FactorCard
              icon={Clock}
              label="Antigüedad del crédito"
              value={creditScore.ageOfCredit || "—"}
              status={creditScore.ageOfCredit}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Score basado en datos reales de tu Informe de Deudas CMF. Las decisiones de otorgamiento de productos corresponden al proveedor financiero.
          </p>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
