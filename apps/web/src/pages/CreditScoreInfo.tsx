import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, TrendingUp, Shield, AlertCircle, CheckCircle } from "lucide-react";

export default function CreditScoreInfo() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white py-20">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Credit Score: Tu Reputación Financiera
            </h1>
            <p className="text-xl text-blue-100 leading-relaxed">
              Entender tu credit score es fundamental para acceder a mejores productos 
              financieros y condiciones de crédito.
            </p>
          </div>
        </div>
      </section>

      {/* What is Credit Score */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              ¿Qué es el Credit Score?
            </h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-6">
              El credit score (o puntaje crediticio) es una calificación numérica que 
              representa tu historial de pago y comportamiento financiero. Las instituciones 
              financieras lo usan para evaluar el riesgo de prestarte dinero.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <TrendingUp className="h-10 w-10 text-green-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Score Alto (700+)</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Mejores tasas de interés</li>
                    <li>• Mayor aprobación de créditos</li>
                    <li>• Límites de crédito más altos</li>
                    <li>• Mejores condiciones</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <AlertCircle className="h-10 w-10 text-orange-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Score Bajo (&lt;600)</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Tasas de interés más altas</li>
                    <li>• Mayor rechazo de solicitudes</li>
                    <li>• Límites más bajos</li>
                    <li>• Más requisitos</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Factors Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              Factores que Afectan tu Score
            </h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">35%</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Historial de Pagos</h3>
                  <p className="text-gray-600">
                    ¿Pagas tus cuentas a tiempo? Los pagos atrasados tienen un gran impacto negativo.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">30%</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Utilización del Crédito</h3>
                  <p className="text-gray-600">
                    ¿Qué porcentaje de tu crédito disponible estás usando? Idealmente, menos del 30%.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">15%</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Antigüedad del Crédito</h3>
                  <p className="text-gray-600">
                    ¿Cuánto tiempo llevas usando crédito? Un historial más largo es mejor.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">10%</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Tipos de Crédito</h3>
                  <p className="text-gray-600">
                    Diversidad de créditos (tarjetas, préstamos, hipoteca) puede ser beneficioso.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">10%</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Solicitudes Recientes</h3>
                  <p className="text-gray-600">
                    Demasiadas solicitudes de crédito en poco tiempo pueden bajar tu score.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How CODA Helps */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center mb-8">
              <Shield className="h-10 w-10 text-blue-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">
                Cómo CODA Te Ayuda
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Análisis ML en Tiempo Real</h3>
                  <p className="text-gray-600">
                    Usamos machine learning (XGBoost) para estimar tu probabilidad de default.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Explicaciones SHAP</h3>
                  <p className="text-gray-600">
                    Entenderás exactamente qué factores afectan tu score.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Seguimiento Histórico</h3>
                  <p className="text-gray-600">
                    Ve cómo evoluciona tu score mes a mes.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Recomendaciones Personalizadas</h3>
                  <p className="text-gray-600">
                    Tips concretos para mejorar tu puntaje crediticio.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Monitorea tu Credit Score Gratis
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Comienza a mejorar tu salud financiera hoy mismo con análisis impulsado por IA.
          </p>
          <Link href={ROUTES.iniciarSesion}>
            <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg">
              Comienza Gratis
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
