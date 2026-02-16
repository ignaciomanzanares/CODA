import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield, Car, Home, Heart, User, CheckCircle } from "lucide-react";

export default function InsuranceRiskInfo() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 text-white py-20">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Evaluación de Riesgo de Seguros
            </h1>
            <p className="text-xl text-green-100 leading-relaxed">
              Entiende tu perfil de riesgo y accede a mejores cotizaciones de seguros 
              con análisis basado en IA.
            </p>
          </div>
        </div>
      </section>

      {/* What is Insurance Risk */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              ¿Qué es el Riesgo de Seguros?
            </h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-6">
              El riesgo de seguros es la probabilidad que una aseguradora asigna de que 
              necesites hacer un reclamo. Mientras menor sea tu riesgo percibido, mejores 
              serán las primas y condiciones que podrás obtener.
            </p>
            <p className="text-gray-600 text-lg leading-relaxed">
              CODA analiza tu comportamiento financiero para estimar tu perfil de riesgo 
              en diferentes tipos de seguros, ayudándote a entender cómo te ven las 
              aseguradoras y qué puedes hacer para mejorar.
            </p>
          </div>
        </div>
      </section>

      {/* Types of Insurance */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              Tipos de Seguro que Evaluamos
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <Car className="h-10 w-10 text-blue-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Seguro de Auto</h3>
                  <p className="text-gray-600 mb-4">
                    Evaluamos factores como tu historial de pagos, estabilidad financiera, 
                    y comportamiento de gasto para estimar tu riesgo automotriz.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-500">
                    <li>• Historial de responsabilidad</li>
                    <li>• Estabilidad de ingresos</li>
                    <li>• Patrones de gasto</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Home className="h-10 w-10 text-orange-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Seguro de Hogar</h3>
                  <p className="text-gray-600 mb-4">
                    Analizamos tu capacidad de mantener pagos constantes y tu historial 
                    de gestión de activos para evaluar tu riesgo habitacional.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-500">
                    <li>• Capacidad de pago</li>
                    <li>• Gestión de patrimonio</li>
                    <li>• Estabilidad financiera</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Heart className="h-10 w-10 text-red-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Seguro de Salud</h3>
                  <p className="text-gray-600 mb-4">
                    Consideramos tu estabilidad financiera y capacidad de mantener 
                    pagos de prima para evaluar tu perfil de riesgo de salud.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-500">
                    <li>• Estabilidad de ingresos</li>
                    <li>• Historial de pagos</li>
                    <li>• Fondo de emergencia</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <User className="h-10 w-10 text-purple-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Seguro de Vida</h3>
                  <p className="text-gray-600 mb-4">
                    Evaluamos tu comportamiento financiero general, incluyendo ahorros, 
                    deudas y estabilidad para determinar tu perfil de riesgo vital.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-500">
                    <li>• Ratio de ahorro</li>
                    <li>• Nivel de endeudamiento</li>
                    <li>• Comportamiento financiero</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Factors */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              Factores que Afectan tu Riesgo
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Historial de Pagos</h3>
                  <p className="text-gray-600">
                    Pagar tus cuentas a tiempo demuestra responsabilidad y reduce tu perfil de riesgo.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Estabilidad de Ingresos</h3>
                  <p className="text-gray-600">
                    Ingresos consistentes indican mayor capacidad de mantener pagos de primas.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Nivel de Endeudamiento</h3>
                  <p className="text-gray-600">
                    Menor deuda en relación a tus ingresos sugiere mejor gestión financiera.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Fondo de Emergencia</h3>
                  <p className="text-gray-600">
                    Tener ahorros para emergencias reduce la probabilidad de no poder pagar primas.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold mb-1">Comportamiento de Gasto</h3>
                  <p className="text-gray-600">
                    Patrones de gasto responsables indican menor riesgo de reclamaciones.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How CODA Helps */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center mb-8">
              <Shield className="h-10 w-10 text-green-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">
                Cómo CODA Te Ayuda
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2 text-lg">Evaluación Integral</h3>
                <p className="text-gray-600">
                  Analizamos múltiples dimensiones de tu comportamiento financiero para 
                  darte una imagen completa de tu perfil de riesgo.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2 text-lg">Scoring por Tipo</h3>
                <p className="text-gray-600">
                  Recibes un score específico para cada tipo de seguro, no solo una 
                  evaluación genérica.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2 text-lg">Recomendaciones Accionables</h3>
                <p className="text-gray-600">
                  Te mostramos qué acciones concretas puedes tomar para mejorar tu 
                  perfil de riesgo.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="font-semibold mb-2 text-lg">Preparación para Cotizar</h3>
                <p className="text-gray-600">
                  Entiende tu posición antes de solicitar cotizaciones, para negociar 
                  mejores condiciones.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-green-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Evalúa tu Riesgo de Seguros Gratis
          </h2>
          <p className="text-xl text-green-100 mb-8 max-w-2xl mx-auto">
            Descubre tu perfil de riesgo y accede a mejores cotizaciones.
          </p>
          <Link href="/login">
            <Button size="lg" className="bg-white text-green-700 hover:bg-green-50 font-semibold px-8 py-6 text-lg">
              Comienza Gratis
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
