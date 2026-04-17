import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function Metodologia() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-24">
      <div className="max-w-lg text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mx-auto">
          <BookOpen className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Metodología de scoring
        </h1>
        <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
          Estamos preparando la publicación completa de nuestra metodología de scoring
          crediticio y transaccional, basada en estándares CMF NCG 502 y la metodología
          Hjelkrem 2022. Pronto disponible.
        </p>
        <p className="text-sm text-gray-400 dark:text-slate-500">
          Si tienes preguntas sobre nuestros algoritmos, escríbenos a{" "}
          <a href="mailto:info@codafinance.cl" className="text-blue-600 hover:underline">
            info@codafinance.cl
          </a>
        </p>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
