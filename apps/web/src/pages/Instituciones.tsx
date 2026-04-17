import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Mail } from "lucide-react";

export default function Instituciones() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-24">
      <div className="max-w-lg text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mx-auto">
          <Building2 className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          CODA para instituciones financieras
        </h1>
        <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
          ¿Eres un banco, cooperativa o compañía de seguros? CODA está construyendo
          integraciones B2B para ofrecer diagnóstico financiero automatizado a tus clientes.
        </p>
        <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
          Scoring crediticio dual, análisis transaccional y recomendaciones de productos —
          todo integrable vía API o white-label.
        </p>
        <a href="mailto:info@codafinance.cl?subject=CODA%20para%20instituciones">
          <Button className="gap-2 bg-blue-600 hover:bg-blue-500">
            <Mail className="h-4 w-4" />
            Contactar al equipo
          </Button>
        </a>
        <div>
          <Link href="/">
            <Button variant="ghost" className="gap-2 text-sm">
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
