import { useQuery, useMutation } from "@tanstack/react-query";
import { useInsuranceRisk } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ProgressRing from "./ProgressRing";
import { 
  getRiskColor, 
  getRiskTextColor,
  getRiskBackgroundColor
} from "@/lib/insuranceRisk";
import {
  Shield,
  Heart,
  Home,
  Car,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

function RiskFactorCard({ 
  icon: Icon, 
  label, 
  riskLevel,
  description 
}: { 
  icon: any; 
  label: string; 
  riskLevel: string;
  description: string;
}) {
  const getStatusConfig = (level: string) => {
    if (level === 'Low') return { 
      color: 'text-green-600 bg-green-50', 
      icon: CheckCircle,
      iconColor: 'text-green-500'
    };
    if (level === 'Medium') return { 
      color: 'text-yellow-600 bg-yellow-50', 
      icon: AlertTriangle,
      iconColor: 'text-yellow-500'
    };
    return { 
      color: 'text-red-600 bg-red-50', 
      icon: AlertTriangle,
      iconColor: 'text-red-500'
    };
  };

  const config = getStatusConfig(riskLevel);
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-1">
        <StatusIcon className={cn("h-4 w-4", config.iconColor)} />
        <Badge variant="secondary" className={cn("text-xs", config.color)}>
          {riskLevel}
        </Badge>
      </div>
    </div>
  );
}

export default function InsuranceRiskCard() {
  const { getInsuranceRisk, refreshInsuranceRisk } = useInsuranceRisk();
  const [, navigate] = useLocation();
  
  const { data: insuranceRisk, isLoading, error } = useQuery({
    queryKey: ["/api/insurance-risk"],
    queryFn: getInsuranceRisk
  });

  const mutation = useMutation({
    mutationFn: refreshInsuranceRisk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] });
    },
  });

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

  if (error || !insuranceRisk) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Riesgo de seguros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Info className="h-6 w-6 text-red-600" />
            </div>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error
                ? error.message
                : "Conecta una cuenta bancaria para evaluar tu riesgo de seguros"}
            </p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] })}
            >
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Convert risk level to progress percentage
  let progress = 50; // Default medium
  if (insuranceRisk.riskLevel === "Low") {
    progress = 85;
  } else if (insuranceRisk.riskLevel === "High") {
    progress = 25;
  }

  const riskColor = getRiskColor(insuranceRisk.riskLevel);
  
  const getStatusBadgeStyle = () => {
    if (insuranceRisk.riskLevel === 'Low') return 'bg-green-100 text-green-700 border-green-200';
    if (insuranceRisk.riskLevel === 'Medium') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Riesgo de seguros
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn("font-semibold", getStatusBadgeStyle())}
          >
            Riesgo {insuranceRisk.riskLevel === 'Low' ? 'bajo' : insuranceRisk.riskLevel === 'Medium' ? 'moderado' : 'alto'}
          </Badge>
        </div>
        <CardDescription>Evaluación de tu perfil de seguros</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        {/* Risk Ring */}
        <div className="flex justify-center py-2">
          <ProgressRing progress={progress} color={riskColor}>
            <div className="text-xl font-bold">
              {insuranceRisk.riskLevel === 'Low' ? 'Bajo' : insuranceRisk.riskLevel === 'Medium' ? 'Moderado' : 'Alto'}
            </div>
            <div className="text-xs text-muted-foreground">Nivel de riesgo</div>
          </ProgressRing>
        </div>

        {/* Risk Summary */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">
            {insuranceRisk.riskLevel === 'Low' 
              ? 'Genial: puedes optar a primas más bajas' 
              : insuranceRisk.riskLevel === 'Medium'
              ? 'Hay margen para mejorar en algunos factores'
              : 'Revisa tus opciones de cobertura'}
          </span>
        </div>

        {/* Risk Factors */}
        <div className="space-y-2 flex-1">
          <RiskFactorCard
            icon={Heart}
            label="Seguro de salud"
            riskLevel={insuranceRisk.healthRisk.replace(' Risk', '')}
            description="Según estilo de vida"
          />
          <RiskFactorCard
            icon={Home}
            label="Seguro de hogar"
            riskLevel={insuranceRisk.propertyRisk}
            description="Casa y pertenencias"
          />
          <RiskFactorCard
            icon={Car}
            label="Seguro de auto"
            riskLevel={insuranceRisk.autoRisk}
            description="Cobertura del vehículo"
          />
        </div>

        {/* Action Button */}
        <Button
          className="w-full mt-4 group"
          onClick={() => navigate("/products?category=insurance")}
        >
          <Shield className="h-4 w-4 mr-2" />
          Ver opciones de seguros
          <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardContent>
    </Card>
  );
}
