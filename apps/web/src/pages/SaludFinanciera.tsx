import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ArrowRight, Upload, Wallet } from "lucide-react";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import HealthLevelCard from "@/components/health/HealthLevelCard";
import EvaluationBreakdown from "@/components/health/EvaluationBreakdown";

type HealthSalida = 'ahorro_inversion' | 'refinanciamiento' | 'reestructuracion' | 'concursal';
type HealthZone = 'critica' | 'intermedia';
type HealthLevel = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

interface HealthEvaluation {
  nivel: HealthLevel;
  nivelNombre: string;
  zona: HealthZone;
  salida: HealthSalida;
  scoreRatios: number;
  scoreInterno: number;
  scoreCompuesto: number;
  nivelBruto: number;
  ratios: {
    deudaFlujo: number;
    deudaActivos: number;
    ahorroIngreso: number;
    moraActiva: boolean;
    diasMora: number;
  };
  productos: {
    productName: string;
    provider: string;
    category: string;
    matchScore: number;
    explanation: string;
  }[];
  insights: string[];
}

interface HealthResponse {
  hasData: boolean;
  evaluation?: HealthEvaluation;
  modelVersion?: string;
  descripcionNivel?: string;
  missingData?: { cartola: boolean; cmf: boolean };
}

const SALIDA_LABEL: Record<HealthSalida, string> = {
  ahorro_inversion: 'Ahorro e Inversión',
  refinanciamiento: 'Refinanciamiento',
  reestructuracion: 'Reestructuración',
  concursal: 'Asesoría legal',
};

export default function SaludFinanciera() {
  const queryClient = useQueryClient();
  const { openWithFilePicker } = useUploadDrawer();
  const { apiRequest } = useApi();

  const { data, isLoading, isError, error } = useQuery<HealthResponse>({
    queryKey: ['health-evaluation'],
    queryFn: () => apiRequest<HealthResponse>('GET', '/api/health-evaluation/me'),
    retry: 1,
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest<HealthResponse>('GET', '/api/health-evaluation/me'),
    onSuccess: (result) => {
      queryClient.setQueryData(['health-evaluation'], result);
    },
  });

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Salud financiera</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-red-600 text-sm">{msg}</p>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['health-evaluation'] })}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.hasData) {
    const missing = data?.missingData;
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Salud financiera</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              Para calcular tu nivel de salud financiera necesitamos{' '}
              {missing?.cartola && missing?.cmf
                ? 'tu cartola bancaria y tu certificado de deudas CMF'
                : missing?.cartola
                  ? 'tu cartola bancaria'
                  : missing?.cmf
                    ? 'tu certificado de deudas CMF'
                    : 'tus documentos financieros'}
              .
            </p>
            <Button className="gap-2" onClick={openWithFilePicker}>
              <Upload className="w-4 h-4" />
              Subir documentos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { evaluation, descripcionNivel } = data;
  if (!evaluation) return null;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Salud financiera</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalcMutation.isPending ? 'animate-spin' : ''}`} />
          Recalcular
        </Button>
      </div>

      <HealthLevelCard
        nivel={evaluation.nivel}
        nivelNombre={evaluation.nivelNombre}
        salida={evaluation.salida}
        scoreCompuesto={evaluation.scoreCompuesto}
        descripcionNivel={descripcionNivel}
      />

      {evaluation.insights.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {evaluation.insights.map((insight, i) => (
              <p key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                {insight}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <EvaluationBreakdown ratios={evaluation.ratios} />

      {evaluation.salida !== 'concursal' && evaluation.productos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Plan de acción — {SALIDA_LABEL[evaluation.salida]}
          </h2>
          <div className="space-y-2">
            {evaluation.productos.map((p, i) => (
              <Card key={i} className="border border-gray-100 hover:border-blue-200 transition-colors">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{p.productName}</div>
                    <div className="text-xs text-gray-500">{p.provider}</div>
                  </div>
                  <Link href={`${ROUTES.productos}?categoria=${p.category}`}>
                    <Button variant="ghost" size="sm" className="gap-1 text-blue-600 hover:text-blue-700">
                      Ver <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {evaluation.salida === 'concursal' && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm text-red-700 font-medium mb-1">Situación de insolvencia activa</p>
            <p className="text-sm text-red-600">
              Tu nivel de deuda requiere asesoría legal especializada. CODA no recomienda
              refinanciamiento en esta situación — hacerlo empeoraría tu carga.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="border-t pt-4">
        <Link href={ROUTES.misActivos}>
          <Button variant="outline" className="gap-2 w-full">
            <Wallet className="w-4 h-4" />
            Gestionar mis activos para mejorar la precisión del diagnóstico
          </Button>
        </Link>
      </div>
    </div>
  );
}
