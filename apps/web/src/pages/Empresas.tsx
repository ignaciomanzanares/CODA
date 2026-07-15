import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Building2,
  TrendingUp,
  FileText,
  Shield,
  BarChart3,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

export default function Empresas() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-700 to-blue-800 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a CODA Personal
            </Button>
          </Link>
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center mb-6">
              <Building2 className="h-16 w-16 text-blue-200" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              CODA <span className="text-blue-200">Empresas</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 leading-relaxed">
              Plataforma de salud financiera y evaluación de riesgo crediticio para PYMEs chilenas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/empresas/login">
                <Button
                  size="lg"
                  className="bg-white text-purple-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg"
                >
                  Ir a CODA Empresas
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-blue-200 text-sm">Gestión financiera integral para tu PYME</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Todo lo que tu Empresa Necesita
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Desde consolidación de caja hasta evaluación de riesgo crediticio
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                  <BarChart3 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Dashboard Ejecutivo</h3>
                <p className="text-gray-600">
                  Métricas CFO en tiempo real: Revenue, EBITDA, Cash Flow, y más.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-14 h-14 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mb-4">
                  <TrendingUp className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Open Banking</h3>
                <p className="text-gray-600">
                  Consolida tu posición de caja desde múltiples bancos automáticamente.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Facturas DTE</h3>
                <p className="text-gray-600">
                  Importa facturas electrónicas directamente desde el SII chileno.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-14 h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mb-4">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Reconciliación</h3>
                <p className="text-gray-600">
                  Motor inteligente que hace match entre transacciones y facturas.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-14 h-14 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Estados Financieros</h3>
                <p className="text-gray-600">
                  Genera automáticamente P&L, Cash Flow, y Balance General.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-14 h-14 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
                  <Shield className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Evaluación de Riesgo</h3>
                <p className="text-gray-600">
                  Rating crediticio (A-E) con recomendaciones de financiamiento.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center">
              ¿Por Qué CODA Empresas?
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 text-lg">
                  <strong>Multi-tenant:</strong> Gestiona múltiples empresas desde una cuenta
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 text-lg">
                  <strong>Conectores integrados:</strong> Open Banking, SII, y órdenes de compra
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 text-lg">
                  <strong>Control de acceso:</strong> RBAC con roles (Admin, CFO, Contador, Viewer)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 text-lg">
                  <strong>Audit logs:</strong> Registro completo de todas las operaciones
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 text-lg">
                  <strong>Comparador de productos:</strong> Factoring, leasing, créditos, y más
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ¿Listo para Transformar tu Gestión Financiera?
          </h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Únete a las PYMEs que ya están tomando mejores decisiones financieras.
          </p>
          <Link href="/empresas/login">
            <Button
              size="lg"
              className="bg-white text-purple-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg"
            >
              Comenzar con CODA Empresas
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="mt-6 text-indigo-200 text-sm">Todo integrado en la misma plataforma CODA</p>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
              CODA Personal vs CODA Empresas
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border-2 border-blue-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">CODA Personal</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600">
                    <li>✓ Para personas individuales</li>
                    <li>✓ Gestión de finanzas personales</li>
                    <li>✓ Credit score individual</li>
                    <li>✓ División de gastos con amigos</li>
                    <li>✓ Metas de ahorro</li>
                    <li>✓ React + Vite</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-2 border-purple-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-purple-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">CODA Empresas</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600">
                    <li>✓ Para PYMEs</li>
                    <li>✓ Gestión financiera empresarial</li>
                    <li>✓ Rating crediticio corporativo</li>
                    <li>✓ Reconciliación de facturas</li>
                    <li>✓ Estados financieros automáticos</li>
                    <li>✓ Integrado en la misma plataforma</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
