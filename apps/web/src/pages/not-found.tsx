import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center px-4">
        <div className="text-5xl font-bold text-blue-500 mb-2">CODA</div>
        <h1 className="text-6xl font-bold text-white mt-6 mb-4">404</h1>
        <p className="text-xl text-slate-300 mb-2">Página no encontrada</p>
        <p className="text-sm text-slate-400 mb-8">
          La página que buscas no existe o fue movida.
        </p>
        <Link href="/">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
