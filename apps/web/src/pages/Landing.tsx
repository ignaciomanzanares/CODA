import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Shield,
  Target,
  TrendingUp,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { Analytics } from "@/lib/analytics";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation(ROUTES.panel);
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Tu asistente financiero{" "}
              <span className="text-blue-200">personal</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 leading-relaxed">
              CODA diagnostica tu situación financiera con datos reales, genera un plan de mejora estructurado y te conecta con los mejores productos financieros del mercado. Gratuito para ti.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href={ROUTES.iniciarSesion}>
                <Button
                  size="lg"
                  className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg"
                  onClick={() => Analytics.signupStarted()}
                >
                  Comenzar gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href={ROUTES.acerca}>
                <Button size="lg" variant="outline" className="border-2 border-white bg-transparent !text-white hover:bg-white hover:!text-blue-700 transition-colors px-8 py-6 text-lg">
                  Conoce más
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-blue-200 text-sm">
              Sin pago requerido. Comienza en segundos.
            </p>
          </div>
        </div>
        {/* Wave decoration */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Un asistente que diagnostica, proyecta, prioriza y acompaña
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              CODA usa tus datos financieros reales para mejorar tu salud financiera de manera medible y verificable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8" />}
              title="Diagnóstico financiero"
              description="Análisis automatizado de tu situación financiera real con datos de fuentes oficiales."
              color="blue"
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="Score crediticio dual"
              description="Score tradicional (historial CMF) y transaccional (comportamiento bancario) para una evaluación completa."
              color="green"
            />
            <FeatureCard
              icon={<Target className="h-8 w-8" />}
              title="Plan de mejora"
              description="Plan estructurado con acciones priorizadas para optimizar tu deuda, ahorro e inversiones."
              color="purple"
            />
            <FeatureCard
              icon={<CreditCard className="h-8 w-8" />}
              title="Marketplace financiero"
              description="Compara y accede a productos financieros en 10 categorías: créditos, tarjetas, fondos mutuos, seguros, APV y más."
              color="orange"
            />
            <FeatureCard
              icon={<TrendingUp className="h-8 w-8" />}
              title="Monitoreo continuo"
              description="Seguimiento de tu comportamiento financiero y alertas cuando surgen oportunidades para ti."
              color="pink"
            />
            <FeatureCard
              icon={<Wallet className="h-8 w-8" />}
              title="Gratuito para ti"
              description="No pagas nada. CODA genera ingresos por comisiones con las instituciones financieras, no contigo."
              color="cyan"
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Comienza en minutos
            </h2>
            <p className="text-xl text-gray-600">
              Tres pasos simples hacia la claridad financiera
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              number="1"
              title="Regístrate"
              description="Crea tu cuenta gratis y sube tus documentos financieros oficiales (informe CMF, cartola bancaria)."
            />
            <StepCard
              number="2"
              title="Diagnóstico"
              description="CODA analiza tus datos reales y genera tu score crediticio dual con un plan de mejora personalizado."
            />
            <StepCard
              number="3"
              title="Actúa"
              description="Recibe recomendaciones de productos financieros alineados a tu perfil y ejecuta tu plan."
            />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                ¿Por qué elegir CODA?
              </h2>
              <div className="space-y-4">
                <BenefitItem text="Gratuito para el usuario, sin cargos ocultos" />
                <BenefitItem text="Datos reales, nunca inventados ni simulados" />
                <BenefitItem text="Recomendaciones ordenadas por tu beneficio, no por comisión" />
                <BenefitItem text="Trazabilidad algorítmica de cada recomendación" />
                <BenefitItem text="Tus datos protegidos: no se comercializan a terceros" />
                <BenefitItem text="Diseñado para cumplir con estándares CMF" />
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl p-8">
                <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">10 categorías de productos</span>
                    <CreditCard className="h-5 w-5 text-blue-500" />
                  </div>
                  <ul className="text-sm text-gray-700 space-y-1.5">
                    <li>Cuentas corrientes, vista y ahorro</li>
                    <li>Tarjetas de crédito y débito</li>
                    <li>Créditos de consumo y líneas de crédito</li>
                    <li>Créditos hipotecarios y portabilidad</li>
                    <li>Depósitos a plazo</li>
                    <li>Fondos mutuos</li>
                    <li>Seguros generales y de vida</li>
                    <li>Ahorro previsional voluntario (APV)</li>
                  </ul>
                  <div className="pt-3 border-t">
                    <p className="text-xs text-gray-500">
                      Comparación intraclase: CODA compara ofertas equivalentes dentro de cada categoría para encontrar la mejor opción según tu perfil.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ¿Listo para transformar tus finanzas?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Mejora tu salud financiera de manera verificable, sin conocimientos técnicos y sin costo.
          </p>
          <Link href={ROUTES.registro}>
            <Button
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg"
              onClick={() => Analytics.signupStarted()}
            >
              Crear cuenta gratis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
    pink: "bg-pink-100 text-pink-600",
    cyan: "bg-cyan-100 text-cyan-600",
  };

  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardContent className="p-6">
        <div className={`w-14 h-14 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-4`}>
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </CardContent>
    </Card>
  );
}

// Step Card Component
function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-blue-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

// Benefit Item Component
function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
      <span className="text-gray-700">{text}</span>
    </div>
  );
}
