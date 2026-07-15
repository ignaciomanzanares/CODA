/**
 * Product Metrics Dashboard
 *
 * Admin dashboard to monitor:
 * - Revenue from product recommendations
 * - Conversion funnel (views → clicks → applications → approvals)
 * - Top performing products
 * - User application history
 */

import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  DollarSign,
  CheckCircle,
  XCircle,
  Eye,
  MousePointer,
  FileText,
  BarChart3,
  Activity,
} from "lucide-react";

export default function ProductMetrics() {
  const { getProductMetrics, getUserApplications } = useApi();

  // Fetch overall metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/products/metrics"],
    queryFn: getProductMetrics,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch user's applications
  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ["/api/products/applications"],
    queryFn: getUserApplications,
  });

  if (metricsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-6">
        <div className="max-w-screen-2xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Extract data from nested structure
  const revenue = metrics?.revenue || {};
  const funnel = metrics?.funnel || {};

  const {
    totalRevenue = 0,
    revenueByType = {},
    applicationsCount = 0,
    approvalsCount = 0,
  } = revenue;

  const {
    totalViews = 0,
    totalClicks = 0,
    totalApplications = 0,
    totalApprovals = 0,
    totalRejections = 0,
    overallConversionRate = 0,
    topPerformingProducts = [],
  } = funnel;

  // Calculate rates
  const viewToClickRate = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
  const clickToApplicationRate = totalClicks > 0 ? (totalApplications / totalClicks) * 100 : 0;
  const applicationToApprovalRate =
    totalApplications > 0 ? (totalApprovals / totalApplications) * 100 : 0;

  const formatCLP = (amount: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-6">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Métricas de Productos</h1>
            <p className="text-muted-foreground">
              Monitoreo de conversiones y revenue en tiempo real
            </p>
          </div>
        </div>

        {/* Revenue Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Revenue Total</p>
                  <p className="text-2xl font-bold">{formatCLP(totalRevenue)}</p>
                  <div className="flex gap-2 mt-2">
                    {revenueByType.lead_fee && (
                      <Badge variant="outline" className="text-xs">
                        Leads: {formatCLP(revenueByType.lead_fee)}
                      </Badge>
                    )}
                    {revenueByType.success_fee && (
                      <Badge variant="outline" className="text-xs">
                        Success: {formatCLP(revenueByType.success_fee)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-green-100">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Aplicaciones</p>
                  <p className="text-2xl font-bold">{totalApplications}</p>
                  <Badge variant="secondary" className="mt-2 text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {totalApprovals} aprobadas
                  </Badge>
                </div>
                <div className="p-3 rounded-lg bg-blue-100">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Tasa de Conversión</p>
                  <p className="text-2xl font-bold">{formatPercent(overallConversionRate)}</p>
                  <p className="text-xs text-muted-foreground mt-2">Views → Approvals</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-100">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Tasa de Aprobación</p>
                  <p className="text-2xl font-bold">{formatPercent(applicationToApprovalRate)}</p>
                  <p className="text-xs text-muted-foreground mt-2">Applications → Approvals</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-100">
                  <CheckCircle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Funnel Visualization */}
        <Card>
          <CardHeader>
            <CardTitle>Funnel de Conversión</CardTitle>
            <CardDescription>
              Seguimiento del recorrido del usuario desde la vista hasta la aprobación
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Views */}
              <div className="flex items-center gap-4">
                <div className="w-24 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Views</span>
                </div>
                <div className="flex-1">
                  <div className="relative h-10 bg-blue-100 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                      <span className="text-sm font-bold text-blue-900">
                        {totalViews.toLocaleString("es-CL")}
                      </span>
                      <span className="text-xs text-blue-700">100%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Clicks */}
              <div className="flex items-center gap-4">
                <div className="w-24 flex items-center gap-2">
                  <MousePointer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Clicks</span>
                </div>
                <div className="flex-1">
                  <div className="relative h-10 bg-muted rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-purple-200 transition-all"
                      style={{ width: `${Math.min(100, viewToClickRate)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                      <span className="text-sm font-bold">
                        {totalClicks.toLocaleString("es-CL")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(viewToClickRate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Applications */}
              <div className="flex items-center gap-4">
                <div className="w-24 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Aplicaciones</span>
                </div>
                <div className="flex-1">
                  <div className="relative h-10 bg-muted rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-200 transition-all"
                      style={{ width: `${Math.min(100, clickToApplicationRate)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                      <span className="text-sm font-bold">
                        {totalApplications.toLocaleString("es-CL")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(clickToApplicationRate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Approvals */}
              <div className="flex items-center gap-4">
                <div className="w-24 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Aprobaciones</span>
                </div>
                <div className="flex-1">
                  <div className="relative h-10 bg-muted rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-green-200 transition-all"
                      style={{ width: `${Math.min(100, applicationToApprovalRate)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                      <span className="text-sm font-bold">
                        {totalApprovals.toLocaleString("es-CL")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(applicationToApprovalRate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Conversion */}
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Conversión Global</span>
                </div>
                <span className="text-2xl font-bold text-primary">
                  {formatPercent(overallConversionRate)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Porcentaje de views que resultan en aprobación
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Top Performing Products */}
        {topPerformingProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Productos Top</CardTitle>
              <CardDescription>
                Mejores productos por tasa de conversión y revenue generado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topPerformingProducts.slice(0, 5).map((product: any, index: number) => (
                  <div
                    key={product.productId}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
                        <span className="text-lg font-bold text-primary">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-semibold">Producto ID: {product.productId}</p>
                        <p className="text-sm text-muted-foreground">
                          Conversión: {formatPercent(product.conversionRate || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">{formatCLP(product.revenue || 0)}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Applications History */}
        {!applicationsLoading && applications && applications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Mis Aplicaciones</CardTitle>
              <CardDescription>Historial de productos a los que has aplicado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {applications.slice(0, 10).map((app: any) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-2 rounded-lg ${
                          app.status === "approved"
                            ? "bg-green-100"
                            : app.status === "rejected"
                              ? "bg-red-100"
                              : app.status === "pending"
                                ? "bg-yellow-100"
                                : "bg-gray-100"
                        }`}
                      >
                        {app.status === "approved" && (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        )}
                        {app.status === "rejected" && <XCircle className="h-5 w-5 text-red-600" />}
                        {app.status === "pending" && (
                          <Activity className="h-5 w-5 text-yellow-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">Producto ID: {app.productId}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(app.appliedAt).toLocaleDateString("es-CL", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          app.status === "approved"
                            ? "default"
                            : app.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {app.status === "approved"
                          ? "Aprobado"
                          : app.status === "rejected"
                            ? "Rechazado"
                            : app.status === "pending"
                              ? "Pendiente"
                              : app.status}
                      </Badge>
                      {app.revenueEarned && (
                        <span className="text-sm font-medium text-green-600">
                          {formatCLP(app.revenueEarned)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!metricsLoading && totalViews === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-muted">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Sin datos aún</h3>
                  <p className="text-muted-foreground max-w-md">
                    Las métricas aparecerán cuando los usuarios comiencen a interactuar con los
                    productos financieros.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
