import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";

function ScoreBar({ min, max, zones }: { min: number; max: number; zones: { from: number; to: number; color: string; label: string }[] }) {
  return (
    <div className="w-full">
      <div className="flex h-6 rounded-full overflow-hidden">
        {zones.map((z, i) => {
          const width = ((z.to - z.from) / (max - min)) * 100;
          return (
            <div key={i} className={`${z.color} h-full`} style={{ width: `${width}%` }} />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        {zones.map((z, i) => (
          <span key={i} className="text-center" style={{ width: `${((z.to - z.from) / (max - min)) * 100}%` }}>
            {z.label}
          </span>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function CreditScoreInfo() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 text-white py-20">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Score crediticio CODA: dos perspectivas sobre tu salud financiera
            </h1>
            <p className="text-xl text-orange-100 leading-relaxed">
              CODA calcula dos scores complementarios para darte una imagen completa de tu
              situación financiera.
            </p>
          </div>
        </div>
      </section>

      {/* Score Tradicional */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Score Tradicional (0 – 850)</h2>
            <div className="text-gray-600 text-lg leading-relaxed space-y-4 mb-8">
              <p>
                El score tradicional de CODA evalúa tu perfil crediticio usando las variables que la
                industria bancaria conoce: historial de obligaciones, comportamiento de pago, niveles
                de endeudamiento y capacidad de repago. Construido con técnicas de machine learning
                supervisado, este score es directamente comparable con los estándares de evaluación
                crediticia en Chile.
              </p>
              <p className="font-medium text-gray-800">
                ¿Para qué sirve? Para entender cómo te ven los bancos y las instituciones financieras hoy.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6">
              <ScoreBar
                min={0}
                max={850}
                zones={[
                  { from: 0, to: 300, color: "bg-red-500", label: "Crítico" },
                  { from: 300, to: 500, color: "bg-orange-400", label: "En riesgo" },
                  { from: 500, to: 620, color: "bg-yellow-400", label: "Regular" },
                  { from: 620, to: 720, color: "bg-lime-400", label: "Bueno" },
                  { from: 720, to: 790, color: "bg-green-400", label: "Muy bueno" },
                  { from: 790, to: 850, color: "bg-emerald-500", label: "Excelente" },
                ]}
              />
            </div>

            <div className="mt-8 space-y-4">
              <h3 className="text-xl font-semibold text-gray-900">Factores que influyen</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <FactorRow weight="35%" title="Historial CMF" desc="Obligaciones vigentes, mora y comportamiento de pago registrado en la CMF." />
                <FactorRow weight="30%" title="Endeudamiento" desc="Relación deuda-ingreso, concentración por tipo de crédito y carga financiera total." />
                <FactorRow weight="20%" title="Comportamiento transaccional" desc="Patrones de gasto, estabilidad de ingresos y uso del flujo de caja." />
                <FactorRow weight="15%" title="Capacidad de pago" desc="Ingreso disponible después de gastos fijos y compromisos financieros." />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Score Transaccional */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Score Transaccional (0 – 100)</h2>
            <div className="text-gray-600 text-lg leading-relaxed space-y-4 mb-8">
              <p>
                El score transaccional captura señales que los modelos crediticios tradicionales no
                miden: estabilidad de tus ingresos, volatilidad de tu flujo mensual, liquidez residual
                después de gastos fijos, ratio de gastos discrecionales y señales tempranas de estrés
                financiero.
              </p>
              <p>
                Basado en metodología académica (Hjelkrem et al., 2022), este score mide tu
                comportamiento financiero real, no solo tu historial de deuda.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border">
              <ScoreBar
                min={0}
                max={100}
                zones={[
                  { from: 0, to: 30, color: "bg-red-500", label: "Bajo" },
                  { from: 30, to: 45, color: "bg-orange-400", label: "Regular" },
                  { from: 45, to: 70, color: "bg-yellow-400", label: "Moderado" },
                  { from: 70, to: 85, color: "bg-green-400", label: "Bueno" },
                  { from: 85, to: 100, color: "bg-emerald-500", label: "Excelente" },
                ]}
              />
            </div>

            <div className="mt-8 space-y-4">
              <h3 className="text-xl font-semibold text-gray-900">Variables del modelo</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <FactorRow weight="25%" title="Liquidez" desc="Saldo disponible promedio en relación a gastos fijos mensuales." />
                <FactorRow weight="20%" title="Estabilidad de ingresos" desc="Variabilidad mes a mes de tus ingresos: a menor volatilidad, mejor score." />
                <FactorRow weight="20%" title="Gastos fijos" desc="Proporción de ingresos comprometida en gastos recurrentes y obligaciones." />
                <FactorRow weight="20%" title="Días críticos" desc="Número de días con saldo por debajo de un umbral mínimo de seguridad." />
                <FactorRow weight="15%" title="Tendencia" desc="Dirección general de tu flujo de caja: ¿estás mejorando o deteriorándote?" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo se complementan */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Cómo se complementan</h2>
            <div className="text-gray-600 text-lg leading-relaxed space-y-4 mb-8">
              <p>
                Juntos, los dos scores entregan una imagen completa. El score tradicional dice dónde
                estás según el sistema. El score transaccional dice cómo te estás comportando realmente.
              </p>
              <p>
                Cuando ambos cuentan la misma historia, tu diagnóstico es robusto. Cuando divergen,
                CODA detecta oportunidades o riesgos que otros no ven.
              </p>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900 leading-relaxed">
                  <p className="font-medium mb-1">Importante</p>
                  <p>
                    El score transaccional opera actualmente como modelo preliminar y se valida
                    empíricamente en paralelo con el score tradicional. CODA no basa decisiones
                    comerciales exclusivamente en el modelo transaccional hasta que su precisión
                    haya sido confirmada mediante procesos de backtesting documentados.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-orange-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Conoce tu score real
          </h2>
          <p className="text-xl text-orange-100 mb-8 max-w-2xl mx-auto">
            Sube tus documentos financieros y recibe tu diagnóstico completo en minutos.
          </p>
          <Link href={ROUTES.registro}>
            <Button size="lg" className="bg-white text-orange-700 hover:bg-orange-50 font-semibold px-8 py-6 text-lg">
              Crear cuenta gratis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function FactorRow({ weight, title, desc }: { weight: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 p-4 bg-white rounded-lg border">
      <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
        <span className="text-orange-600 font-bold text-sm">{weight}</span>
      </div>
      <div>
        <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
        <p className="text-sm text-gray-600">{desc}</p>
      </div>
    </div>
  );
}
