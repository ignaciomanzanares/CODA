import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, Home, Store, HelpCircle } from "lucide-react";
import { ROUTES } from "@/lib/routes";

const suggestions = [
  { icon: Home, label: "Inicio", href: "/", desc: "Volver a la página principal" },
  { icon: Search, label: "Mi Panel", href: ROUTES.panel, desc: "Ver tu dashboard financiero" },
  { icon: Store, label: "Productos", href: ROUTES.productos, desc: "Explorar el marketplace" },
  { icon: HelpCircle, label: "Acerca de CODA", href: ROUTES.acerca, desc: "Conoce nuestra plataforma" },
];

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0f1e] relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-indigo-600/8 blur-[80px] pointer-events-none" />

      <div className="relative text-center px-4 max-w-lg mx-auto">
        {/* Brand */}
        <div className="text-2xl font-bold text-blue-500 tracking-wider mb-8">CODA</div>

        {/* 404 number */}
        <div className="relative mb-6">
          <span className="text-[120px] sm:text-[160px] font-black leading-none text-white/[0.04] select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <h1 className="text-5xl sm:text-6xl font-bold text-white">404</h1>
          </div>
        </div>

        {/* Message */}
        <p className="text-xl font-semibold text-white mb-2">Página no encontrada</p>
        <p className="text-sm text-slate-400 mb-10 leading-relaxed max-w-sm mx-auto">
          La página que buscas no existe, fue movida o el enlace está incorrecto. Prueba con alguna de estas opciones:
        </p>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3 mb-10">
          {suggestions.map(({ icon: Icon, label, href, desc }) => (
            <Link key={href} href={href}>
              <div className="group p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer text-left">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
                  <Icon className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-sm font-medium text-white mb-0.5">{label}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Primary CTA */}
        <Link href="/">
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 h-11 shadow-lg shadow-blue-600/20 transition-all"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
