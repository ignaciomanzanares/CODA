import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Target, TrendingUp, PiggyBank, Home, GraduationCap, Heart, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function FinancialGoalsInfo() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white py-20">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Metas Financieras: Tu Hoja de Ruta al Éxito
            </h1>
            <p className="text-xl text-purple-100 leading-relaxed mb-8">
              Define, planifica y alcanza tus objetivos financieros con seguimiento personalizado 
              y recomendaciones inteligentes.
            </p>
            
            {/* CTA for authenticated users */}
            {!isLoading && isAuthenticated && (
              <Button 
                size="lg" 
                className="bg-white text-purple-700 hover:bg-purple-50"
                onClick={() => navigate("/goals")}
              >
                Ir a Mis Metas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {!isLoading && !isAuthenticated && (
              <Button 
                size="lg" 
                className="bg-white text-purple-700 hover:bg-purple-50"
                onClick={() => navigate("/signup")}
              >
                Crear Cuenta Gratis
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* What are Financial Goals */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              ¿Qué son las Metas Financieras?
            </h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-6">
              Las metas financieras son objetivos concretos y medibles que defines para tu futuro económico. 
              CODA te ayuda a estructurarlas, hacer seguimiento de tu progreso y recibir recomendaciones 
              personalizadas para alcanzarlas más rápido.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mt-12">
              <Card>
                <CardContent className="p-6">
                  <PiggyBank className="h-10 w-10 text-green-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Ahorro</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• Fondo de emergencia</li>
                    <li>• Vacaciones</li>
                    <li>• Inversiones</li>
                    <li>• Jubilación</li>
                  </ul>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <Home className="h-10 w-10 text-blue-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Compras Grandes</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• Casa propia</li>
                    <li>• Auto nuevo</li>
                    <li>• Remodelación</li>
                    <li>• Equipamiento</li>
                  </ul>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <GraduationCap className="h-10 w-10 text-purple-500 mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Educación</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>• Estudios superiores</li>
                    <li>• Postgrado</li>
                    <li>• Cursos</li>
                    <li>• Educación hijos</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              ¿Cómo te Ayuda CODA?
            </h2>
            <div className="space-y-8">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Target className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Define Metas Claras</h3>
                  <p className="text-gray-600">
                    Establece el monto objetivo, fecha límite y categoría. CODA calcula automáticamente 
                    cuánto necesitas ahorrar mensualmente para alcanzar tu meta.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Seguimiento en Tiempo Real</h3>
                  <p className="text-gray-600">
                    Ve tu progreso actualizado automáticamente basándose en tus movimientos bancarios 
                    y ahorros. Gráficos visuales te muestran qué tan cerca estás de tu objetivo.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Heart className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-3">Recomendaciones Personalizadas</h3>
                  <p className="text-gray-600">
                    Recibe sugerencias inteligentes para optimizar tu ahorro: áreas donde recortar gastos, 
                    productos de inversión recomendados según tu perfil, y estrategias para acelerar tu progreso.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Cómo Funciona
            </h2>
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  1
                </div>
                <h3 className="font-semibold mb-2">Crea tu Meta</h3>
                <p className="text-sm text-gray-600">
                  Define monto, fecha y categoría
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  2
                </div>
                <h3 className="font-semibold mb-2">Conecta tu Banco</h3>
                <p className="text-sm text-gray-600">
                  Sincroniza automáticamente tus ahorros
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  3
                </div>
                <h3 className="font-semibold mb-2">Haz Seguimiento</h3>
                <p className="text-sm text-gray-600">
                  Ve tu progreso en tiempo real
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  4
                </div>
                <h3 className="font-semibold mb-2">¡Alcánzala!</h3>
                <p className="text-sm text-gray-600">
                  Celebra cuando llegues a tu objetivo
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-purple-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            {isAuthenticated ? "Empieza a Definir tus Metas" : "Comienza Hoy Mismo"}
          </h2>
          <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
            {isAuthenticated 
              ? "Crea tu primera meta financiera y comienza a ver tu progreso en tiempo real."
              : "Únete a miles de personas que están alcanzando sus objetivos financieros con CODA."}
          </p>
          
          {!isLoading && isAuthenticated && (
            <Button 
              size="lg" 
              className="bg-white text-purple-700 hover:bg-purple-50"
              onClick={() => navigate("/goals")}
            >
              Crear Mi Primera Meta
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          
          {!isLoading && !isAuthenticated && (
            <div className="flex gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-purple-700 hover:bg-purple-50"
                onClick={() => navigate("/signup")}
              >
                Crear Cuenta Gratis
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="border-white text-white hover:bg-white/10"
                onClick={() => navigate("/login")}
              >
                Iniciar Sesión
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
