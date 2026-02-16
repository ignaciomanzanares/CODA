import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ArrowRight, ExternalLink } from "lucide-react";

/**
 * Página de transición para rutas de CODA Empresas.
 * Durante la migración al monorepo unificado, estas rutas dirigen a la aplicación
 * actual de Empresas (puerto 3001) hasta que la integración esté completa.
 */
const EMPRESAS_APP_URL = import.meta.env.VITE_EMPRESAS_APP_URL || "http://localhost:3001";

export default function EmpresasTransition() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-2 border-primary/20">
        <CardContent className="p-8">
          <div className="flex justify-center mb-6">
            <div className="rounded-xl bg-primary/10 p-4">
              <Building2 className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">
            CODA Empresas
          </h1>
          <p className="text-muted-foreground text-center mb-6">
            La sección empresarial se está integrando en esta plataforma. 
            Mientras tanto, puedes acceder a todas las funciones en la aplicación actual.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href={EMPRESAS_APP_URL} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button className="w-full" size="lg">
                Ir a CODA Empresas
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <Link href="/empresas">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Ver información
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-6">
            Transición en curso según el plan de plataforma unificada CODA.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
