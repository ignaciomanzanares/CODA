import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ShoppingCart, Sparkles, TrendingUp, Shield, DollarSign, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function ProductComparisonInfo() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white py-20">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Comparación de Productos Financieros
            </h1>
            <p className="text-xl text-blue-100 leading-relaxed mb-8">
              Encuentra los mejores productos financieros para tu perfil. Créditos, tarjetas, 
              cuentas y seguros personalizados según tu situación.
            </p>
            
            {/* CTA for authenticated users */}
            {!isLoading && isAuthenticated && (
              <Button 
                size="lg" 
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/products")}
              >
                Ver Productos Recomendados
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {!isLoading && !isAuthenticated && (
              <Button 
                size="lg" 
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/signup")}
              >
                Crear Cuenta Gratis
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* What is Product Comparison */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              ¿Cómo Funciona la Comparación?
            </h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-12">
              CODA analiza tu perfil financiero (credit score, ingresos, historial transaccional) 
              y te muestra solo los productos para los que calificas, ordenados por qué tan bien 
              se ajustan a tu situación.
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <Sparkles className="h-10 w-10 text-purple-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Personalización Inteligente</h3>
                  <p className="text-gray-600">
                    Cada producto tiene un "match score" que indica qué tan bien se ajusta a tu perfil. 
                    Solo ves productos relevantes para ti.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <Shield className="h-10 w-10 text-blue-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Pre-calificación Automática</h3>
                  <p className="text-gray-600">
                    Verificamos que cumplas los requisitos mínimos (score, ingresos, DTI) antes de 
                    mostrarte un producto, aumentando tus chances de aprobación.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Product Categories */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Productos Disponibles
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-2 hover:border-blue-500 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-blue-100">
                      <DollarSign className="h-6 w-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold">Créditos</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• <strong>Consumo:</strong> Tasas desde 1.65% mensual</li>
                    <li>• <strong>Hipotecarios:</strong> Financiamiento hasta 90%</li>
                    <li>• <strong>Pyme:</strong> Capital de trabajo hasta UF 10.000</li>
                  </ul>
                  <p className="text-xs text-gray-500 mt-4">
                    De Banco de Chile, Santander, BCI, BancoEstado
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-purple-500 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-purple-100">
                      <ShoppingCart className="h-6 w-6 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-semibold">Tarjetas de Crédito</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• <strong>Cashback:</strong> Hasta 3% en supermercados</li>
                    <li>• <strong>Premium:</strong> Acceso salas VIP, seguros incluidos</li>
                    <li>• <strong>Sin costo:</strong> Opciones sin mantención ni emisión</li>
                  </ul>
                  <p className="text-xs text-gray-500 mt-4">
                    De BCI, Banco de Chile, Scotiabank
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-green-500 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-green-100">
                      <PiggyBank className="h-6 w-6 text-green-600" />
                    </div>
                    <h3 className="text-xl font-semibold">Ahorro e Inversión</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• <strong>Cuentas corrientes:</strong> Digitales, sin mantención</li>
                    <li>• <strong>Cuentas vista:</strong> Sin requisitos de renta</li>
                    <li>• <strong>Depósitos a plazo:</strong> Hasta 5.8% anual</li>
                  </ul>
                  <p className="text-xs text-gray-500 mt-4">
                    De BCI, BancoEstado, Santander, Banco de Chile
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-orange-500 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-orange-100">
                      <Shield className="h-6 w-6 text-orange-600" />
                    </div>
                    <h3 className="text-xl font-semibold">Seguros</h3>
                  </div>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• <strong>Automotriz:</strong> Cobertura total + asistencia 24/7</li>
                    <li>• <strong>Hogar:</strong> Protección contra incendio y robo</li>
                    <li>• <strong>Vida:</strong> Cobertura hasta UF 5.000</li>
                  </ul>
                  <p className="text-xs text-gray-500 mt-4">
                    De HDI, Metlife, Zurich Seguros
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Beneficios de Usar CODA
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold mb-2">Ahorra Tiempo</h3>
                <p className="text-sm text-gray-600">
                  No más horas comparando manualmente. Resultados personalizados en segundos.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">Mejores Condiciones</h3>
                <p className="text-sm text-gray-600">
                  Te mostramos productos con mejores tasas y beneficios según tu perfil.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="font-semibold mb-2">Mayor Aprobación</h3>
                <p className="text-sm text-gray-600">
                  Solo productos para los que calificas, reduciendo rechazos innecesarios.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            {isAuthenticated ? "Explora los Productos" : "¿Listo para Encontrar tu Producto Ideal?"}
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            {isAuthenticated 
              ? "Ve tus recomendaciones personalizadas y encuentra el producto perfecto para ti."
              : "Crea tu cuenta gratis y descubre productos financieros diseñados para tu perfil."}
          </p>
          
          {!isLoading && isAuthenticated && (
            <Button 
              size="lg" 
              className="bg-white text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/products")}
            >
              Ver Productos Recomendados
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          
          {!isLoading && !isAuthenticated && (
            <Button 
              size="lg" 
              className="bg-white text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/signup")}
            >
              Crear Cuenta Gratis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
