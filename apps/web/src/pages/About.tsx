import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target, Users, Shield, TrendingUp } from "lucide-react";

export default function About() {
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
              Sobre CODA
            </h1>
            <p className="text-xl text-blue-100 leading-relaxed">
              CODA es una plataforma tecnológica que opera como asistente financiero automatizado
              y marketplace financiero digital. Nuestro propósito es mejorar la salud financiera
              de las personas en Chile, de manera medible y verificable.
            </p>
          </div>
        </div>
      </section>

      {/* Misión y Propuesta */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <div className="flex items-center mb-4">
                  <Target className="h-10 w-10 text-blue-600 mr-3" />
                  <h2 className="text-3xl font-bold text-gray-900">Propuesta de valor</h2>
                </div>
                <p className="text-gray-600 text-lg leading-relaxed">
                  CODA permite que una persona, sin conocimientos financieros especializados,
                  acceda a un diagnóstico de su situación financiera, reciba un plan de mejora
                  estructurado y pueda ejecutar decisiones recomendadas para optimizar su deuda,
                  aumentar su ahorro e inversión, y elegir productos financieros adecuados a su perfil.
                </p>
              </div>

              <div>
                <div className="flex items-center mb-4">
                  <Shield className="h-10 w-10 text-blue-600 mr-3" />
                  <h2 className="text-3xl font-bold text-gray-900">Principios</h2>
                </div>
                <ul className="space-y-3 text-gray-600 text-lg">
                  <li>Neutralidad del consejo</li>
                  <li>Responsabilidad financiera</li>
                  <li>Trazabilidad algorítmica</li>
                  <li>Consentimiento informado</li>
                  <li>Protección del usuario</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Equipo */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center mb-8">
              <Users className="h-10 w-10 text-blue-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">Equipo fundador</h2>
            </div>
            <p className="text-gray-600 text-lg mb-8">
              Tres socios con capacidades complementarias en las áreas críticas para una
              entidad regulada: conocimiento legal y regulatorio, ingeniería de software, y análisis cuantitativo de datos.
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              <TeamMember
                name="Thomas Schmidt Puga"
                role="CEO — Legal y Regulatorio"
                description="Gestión del frente normativo, coordinación del proceso de autorización ante la CMF y representación institucional."
              />
              <TeamMember
                name="Ignacio Manzanares Banchero"
                role="CTO — Tecnología"
                description="Arquitectura del sistema, seguridad de la información, integraciones con el Sistema de Finanzas Abiertas y controles técnicos."
              />
              <TeamMember
                name="Tomás Andrés Marín Álamos"
                role="COO — Data & Analytics"
                description="Diseño y calibración de los modelos de scoring, pipeline de datos transaccionales y crediticios, operación cotidiana."
              />
            </div>
          </div>
        </div>
      </section>

      {/* Modelo de Negocio */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center mb-8">
              <TrendingUp className="h-10 w-10 text-blue-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">Modelo de negocio</h2>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="mb-6">
                CODA opera bajo un modelo B2B2C: el usuario final no paga por el servicio.
                Los ingresos provienen de comisiones por originación y acuerdos de revenue sharing
                con bancos, instituciones financieras, aseguradoras y administradoras de fondos,
                bajo contratos comerciales formales y con reglas explícitas de mitigación de conflictos de interés.
              </p>
              <p className="mb-6">
                CODA no desarrolla productos financieros propios ni comercializa datos individuales
                de usuarios a terceros. Las recomendaciones se ordenan siempre por valor neto
                esperado para el usuario, no por el ingreso que generan a CODA.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Info corporativa */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-gray-500 text-sm">
              Chile Open-Data Analytics SpA — RUT 78.389.632-K — Sociedad 100% propiedad de We-Group Holding SpA (RUT 78.389.629-K)
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Mejora tu salud financiera hoy
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Regístrate gratis y obtén tu diagnóstico financiero con datos reales.
          </p>
          <Link href={ROUTES.registro}>
            <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg">
              Comienza Gratis
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function TeamMember({ name, role, description }: { name: string; role: string; description: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border">
      <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-4">
        <span className="text-blue-600 font-bold text-lg">
          {name.split(" ").map(n => n[0]).slice(0, 2).join("")}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{name}</h3>
      <p className="text-sm font-medium text-blue-600 mb-3">{role}</p>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
