import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass, Layers, Handshake, Users, Building2 } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white py-20">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-8">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Sobre CODA</h1>
            <p className="text-xl text-blue-100 leading-relaxed">
              Plataforma de salud financiera personal y marketplace financiero digital para Chile.
            </p>
          </div>
        </div>
      </section>

      {/* Misión */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <Compass className="h-10 w-10 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Misión</h2>
                <p className="text-gray-600 text-lg leading-relaxed">
                  CODA existe para que cualquier persona en Chile pueda tomar decisiones financieras
                  informadas, objetivas y alineadas con su interés de largo plazo, sin necesidad de
                  conocimientos técnicos especializados.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Qué hacemos */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <Layers className="h-10 w-10 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Qué hacemos</h2>
                <div className="text-gray-600 text-lg leading-relaxed space-y-4">
                  <p>
                    Somos una plataforma de salud financiera que combina datos financieros reales,
                    modelos de scoring propios y un marketplace de productos financieros para entregar
                    diagnóstico, plan de mejora y ejecución en un solo lugar.
                  </p>
                  <p>
                    No somos un comparador estático que muestra opciones y delega la decisión. CODA es
                    un asistente que diagnostica, proyecta, prioriza y acompaña al usuario en la
                    ejecución de su plan financiero.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modelo de negocio */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <Handshake className="h-10 w-10 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Modelo de negocio</h2>
                <div className="text-gray-600 text-lg leading-relaxed space-y-4">
                  <p>
                    CODA es gratuito para las personas. Generamos ingresos por comisiones de originación
                    y revenue sharing con instituciones financieras cuando un usuario contrata un producto
                    a través de nuestra plataforma.
                  </p>
                  <p>
                    Nuestras recomendaciones se ordenan siempre por valor neto para el usuario, no por la
                    comisión que generan para CODA. Cuando dos productos son comparables, priorizamos el
                    de menor costo para ti.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Equipo fundador */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <Users className="h-10 w-10 text-blue-600" />
              <h2 className="text-3xl font-bold text-gray-900">Equipo fundador</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <TeamMember
                name="Thomas Schmidt Puga"
                role="CEO · Legal y Regulatorio"
                description="Responsable del frente normativo y la relación con la CMF. Lidera gobernanza, cumplimiento regulatorio y representación institucional de la compañía."
              />
              <TeamMember
                name="Ignacio Manzanares Banchero"
                role="CTO · Tecnología"
                description="Lidera el desarrollo de la plataforma, la arquitectura de seguridad, las integraciones técnicas y la implementación de los controles descritos ante el regulador."
              />
              <TeamMember
                name="Tomás Andrés Marín Álamos"
                role="COO · Data & Analytics"
                description="Responsable del diseño y calibración de los modelos de scoring, el pipeline de datos y la operación cotidiana de la compañía."
              />
            </div>
          </div>
        </div>
      </section>

      {/* Marco regulatorio */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <Building2 className="h-10 w-10 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Marco regulatorio</h2>
                <div className="text-gray-600 text-lg leading-relaxed space-y-4">
                  <p>
                    CODA ha sido diseñada desde su origen para operar como prestador de servicios
                    financieros regulados. En abril de 2026, Chile Open-Data Analytics SpA presentó
                    su solicitud de inscripción ante la Comisión para el Mercado Financiero (CMF)
                    como prestador de servicios de asesoría crediticia y asesoría de inversión bajo
                    el marco de la Ley N° 21.521 (Ley Fintec).
                  </p>
                  <p>
                    La plataforma incorpora principios de trazabilidad algorítmica, protección al
                    consumidor financiero, mitigación de conflictos de interés y seguridad de la
                    información desde su diseño inicial.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Info corporativa */}
      <section className="py-8 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-gray-500 text-sm">
              Chile Open-Data Analytics SpA — RUT 78.389.632-K — Sociedad 100% propiedad de We-Group Holding SpA (RUT 78.389.629-K)
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ¿Quieres saber más?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
            <Link href={ROUTES.registro}>
              <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg">
                Crear cuenta gratis
              </Button>
            </Link>
            <a href="mailto:contacto@codafinance.cl" className="text-blue-100 hover:text-white underline">
              Contáctanos → contacto@codafinance.cl
            </a>
          </div>
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
