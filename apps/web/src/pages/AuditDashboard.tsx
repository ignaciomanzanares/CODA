/**
 * Audit & Compliance Dashboard
 *
 * Displays algorithmic traceability information for CMF compliance.
 * Shows:
 * - Credit score prediction history
 * - Model versions used
 * - Top factors for each prediction
 * - Audit statistics
 *
 * Audience: Internal admins and users disputing scores
 *
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
} from "lucide-react";
import type { ReactNode } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface PredictionSummary {
  id: string;
  timestamp: string;
  creditScore: number;
  riskCategory: string;
  confidence: number;
  topFactors?: Array<{
    name: string;
    value: any;
    impact: number;
    explanation: string;
  }>;
  modelVersion: string;
}

interface AuditStats {
  totalPredictions: number;
  predictionsLast24h: number;
  avgCreditScore: number;
  avgProbabilityDefault: string;
  totalModelVersions: number;
  totalAlgorithmChanges: number;
}

interface ActiveModel {
  version: string;
  modelType: string;
  deployedAt: string;
  trainingMetrics?: {
    auc?: number;
    gini?: number;
    brierScore?: number;
  };
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchMyPredictions(): Promise<{ predictions: PredictionSummary[]; total: number }> {
  const res = await fetch("/api/audit/my-predictions", {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Error al cargar historial de predicciones");
  }

  return res.json();
}

async function fetchAuditStats(): Promise<{ stats: AuditStats; activeModel: ActiveModel }> {
  const res = await fetch("/api/audit/admin/stats", {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Error al cargar estadísticas de auditoría");
  }

  return res.json();
}

// ============================================================================
// COMPONENTS
// ============================================================================

function RiskCategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    EXCELLENT: "bg-green-100 text-green-800 border-green-200",
    GOOD: "bg-blue-100 text-blue-800 border-blue-200",
    AVERAGE: "bg-yellow-100 text-yellow-800 border-yellow-200",
    POOR: "bg-orange-100 text-orange-800 border-orange-200",
    VERY_POOR: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <Badge variant="outline" className={colorMap[category] || "bg-gray-100 text-gray-800"}>
      {category}
    </Badge>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
        {Icon && <div className="text-slate-500">{Icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function PredictionCard({ prediction }: { prediction: PredictionSummary }) {
  const date = new Date(prediction.timestamp);

  return (
    <Card className="hover:bg-slate-50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-3xl font-bold text-slate-900">{prediction.creditScore}</span>
              <RiskCategoryBadge category={prediction.riskCategory} />
            </div>
            <CardDescription className="text-xs">
              {date.toLocaleString("es-CL")} · Modelo {prediction.modelVersion}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end">
            <Badge variant="secondary" className="text-xs">
              Confianza: {Math.round(prediction.confidence * 100)}%
            </Badge>
          </div>
        </div>
      </CardHeader>

      {prediction.topFactors && prediction.topFactors.length > 0 && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 mb-2">Principales Factores:</p>
            {prediction.topFactors.slice(0, 3).map((factor, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                {factor.impact > 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="font-medium text-slate-700">{factor.name}:</span>
                  <span className="text-slate-600 ml-1">{factor.explanation}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AuditDashboard() {
  const { data: predictionsData, isLoading: loadingPredictions } = useQuery({
    queryKey: ["audit", "my-predictions"],
    queryFn: fetchMyPredictions,
  });

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ["audit", "stats"],
    queryFn: fetchAuditStats,
  });

  const predictions = predictionsData?.predictions || [];
  const stats = statsData?.stats;
  const activeModel = statsData?.activeModel;

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
          Trazabilidad Algorítmica
        </h1>
        <p className="text-sm text-slate-600">
          Auditoría y transparencia de decisiones crediticias (Cumplimiento CMF NCG 502)
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Predicciones"
            value={stats.totalPredictions}
            description="Desde el inicio del sistema"
            icon={<Activity className="w-4 h-4" />}
          />
          <StatCard
            title="Últimas 24h"
            value={stats.predictionsLast24h}
            description="Predicciones recientes"
            icon={<Clock className="w-4 h-4" />}
          />
          <StatCard
            title="Score Promedio"
            value={stats.avgCreditScore}
            description="Promedio histórico"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <StatCard
            title="Versiones de Modelo"
            value={stats.totalModelVersions}
            description="Modelos registrados"
            icon={<GitBranch className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Active Model Info */}
      {activeModel && (
        <Card className="mb-6 border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-base">Modelo Activo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-600 text-xs">Versión</p>
                <p className="font-mono font-semibold text-slate-900">{activeModel.version}</p>
              </div>
              <div>
                <p className="text-slate-600 text-xs">Tipo</p>
                <p className="font-medium text-slate-900 capitalize">
                  {activeModel.modelType.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <p className="text-slate-600 text-xs">Desplegado</p>
                <p className="font-medium text-slate-900">
                  {new Date(activeModel.deployedAt).toLocaleDateString("es-CL")}
                </p>
              </div>
            </div>

            {activeModel.trainingMetrics && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-xs text-slate-600 mb-2">Métricas de Entrenamiento:</p>
                <div className="flex gap-4 text-xs">
                  {activeModel.trainingMetrics.auc && (
                    <span className="text-slate-700">
                      AUC:{" "}
                      <span className="font-mono font-semibold">
                        {activeModel.trainingMetrics.auc.toFixed(3)}
                      </span>
                    </span>
                  )}
                  {activeModel.trainingMetrics.gini && (
                    <span className="text-slate-700">
                      Gini:{" "}
                      <span className="font-mono font-semibold">
                        {activeModel.trainingMetrics.gini.toFixed(3)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Predictions History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Historial de Predicciones
          </CardTitle>
          <CardDescription>
            Todas tus evaluaciones crediticias con explicaciones completas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPredictions ? (
            <div className="text-center py-8 text-slate-500">Cargando historial...</div>
          ) : predictions.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay predicciones registradas aún</p>
              <p className="text-xs text-slate-400 mt-1">
                Sube un documento CMF para generar tu primer score
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {predictions.map((prediction) => (
                  <PredictionCard key={prediction.id} prediction={prediction} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Compliance Notice */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600">
            <p className="font-medium mb-1">Cumplimiento Regulatorio CMF</p>
            <p>
              Todas las decisiones algorítmicas son registradas según lo exigido por la NCG 502.
              Tienes derecho a disputar cualquier score y recibir explicaciones detalladas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
