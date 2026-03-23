import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target, Users, Heart, TrendingUp } from "lucide-react";

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
              Sobre Nosotros
            </h1>
            <p className="text-xl text-blue-100 leading-relaxed">
              CODA nació con la misión de democratizar el acceso a herramientas financieras 
              de calidad para todos los chilenos.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <div className="flex items-center mb-4">
                  <Target className="h-10 w-10 text-blue-600 mr-3" />
                  <h2 className="text-3xl font-bold text-gray-900">Nuestra Misión</h2>
                </div>
                <p className="text-gray-600 text-lg leading-relaxed">
                  Empoderar a las personas para que tomen control de su salud financiera 
                  mediante tecnología accesible, intuitiva y basada en inteligencia artificial.
                </p>
              </div>

              <div>
                <div className="flex items-center mb-4">
                  <Heart className="h-10 w-10 text-blue-600 mr-3" />
                  <h2 className="text-3xl font-bold text-gray-900">Nuestros Valores</h2>
                </div>
                <ul className="space-y-3 text-gray-600 text-lg">
                  <li>• Transparencia en todo lo que hacemos</li>
                  <li>• Accesibilidad para todos</li>
                  <li>• Innovación continua</li>
                  <li>• Seguridad de datos</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why We Do It Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center mb-8">
              <Users className="h-10 w-10 text-blue-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">¿Por Qué Lo Hacemos?</h2>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="mb-6">
                En Chile, muchas personas no tienen acceso a herramientas que les ayuden 
                a entender su situación financiera real. La educación financiera sigue 
                siendo un privilegio, y las herramientas existentes suelen ser complejas 
                o costosas.
              </p>
              <p className="mb-6">
                CODA cambia esto. Creemos que todos merecen tener claridad sobre su 
                dinero, entender su riesgo crediticio, y tomar decisiones informadas 
                sobre su futuro financiero.
              </p>
              <p>
                Nuestra plataforma combina lo mejor de la tecnología moderna - 
                inteligencia artificial, análisis de datos, y diseño centrado en el 
                usuario - para crear una experiencia que sea tan poderosa como fácil 
                de usar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center mb-8">
              <TrendingUp className="h-10 w-10 text-blue-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">Nuestra Historia</h2>
            </div>
            <p className="text-gray-600 text-lg leading-relaxed mb-6">
              CODA comenzó como un proyecto para ayudar a amigos y familiares a 
              entender mejor sus finanzas personales. Nos dimos cuenta de que había 
              una necesidad real de herramientas financieras que fueran:
            </p>
            <ul className="space-y-3 text-gray-600 text-lg ml-6 mb-6">
              <li>✓ <strong>Gratis y accesibles</strong> para todos</li>
              <li>✓ <strong>Fáciles de usar</strong> sin conocimiento técnico</li>
              <li>✓ <strong>Potentes</strong> con tecnología de punta</li>
              <li>✓ <strong>Seguras</strong> con protección bancaria</li>
            </ul>
            <p className="text-gray-600 text-lg leading-relaxed">
              Hoy, CODA sirve a miles de usuarios en Chile, ayudándoles a ahorrar, 
              planificar, y alcanzar sus metas financieras. Y apenas estamos comenzando.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ¿Listo para tomar control de tus finanzas?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Únete a miles de chilenos que ya están mejorando su salud financiera.
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
