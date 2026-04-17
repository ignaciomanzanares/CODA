import { Link } from "wouter";
import { Wallet } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 py-12 safe-x">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center mb-4">
              <Wallet className="text-white mr-2" />
              <h3 className="text-white font-bold text-lg font-sans">CODA</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Diagnóstico financiero automatizado, score crediticio dual y recomendaciones personalizadas.
            </p>
          </div>

          {/* Producto */}
          <div>
            <h4 className="text-white font-medium mb-4 text-sm">Producto</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href={ROUTES.infoScoreCredito} className="text-gray-400 hover:text-white transition-colors">Score crediticio</Link></li>
              <li><Link href={ROUTES.infoComparacionProductos} className="text-gray-400 hover:text-white transition-colors">Comparar productos</Link></li>
              <li><Link href={ROUTES.infoMetasFinancieras} className="text-gray-400 hover:text-white transition-colors">Metas financieras</Link></li>
              <li><Link href={ROUTES.infoRiesgoSeguros} className="text-gray-400 hover:text-white transition-colors">Riesgo y seguros</Link></li>
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h4 className="text-white font-medium mb-4 text-sm">Empresa</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href={ROUTES.acerca} className="text-gray-400 hover:text-white transition-colors">Nosotros</Link></li>
              <li><Link href="/instituciones" className="text-gray-400 hover:text-white transition-colors">Para instituciones</Link></li>
              <li><Link href="/metodologia" className="text-gray-400 hover:text-white transition-colors">Metodología</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-medium mb-4 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href={ROUTES.privacidad} className="text-gray-400 hover:text-white transition-colors">Privacidad</Link></li>
              <li><Link href={ROUTES.terminos} className="text-gray-400 hover:text-white transition-colors">Términos</Link></li>
              <li><Link href="/metodologia" className="text-gray-400 hover:text-white transition-colors">Metodología</Link></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h4 className="text-white font-medium mb-4 text-sm">Contacto</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="mailto:info@codafinance.cl" className="text-gray-400 hover:text-white transition-colors">
                  info@codafinance.cl
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Separator + legal block */}
        <div className="mt-10 pt-6 border-t border-gray-700">
          {/* Identification */}
          <p className="text-gray-400 text-xs mb-1">
            <strong className="text-gray-300">Chile Open-Data Analytics SpA</strong> &middot; RUT 78.389.632-K
          </p>
          <p className="text-gray-500 text-xs mb-4">
            Inscripción como prestador Fintec ante la CMF en trámite.
          </p>

          {/* Regulatory disclaimers */}
          <div className="text-gray-500 text-[11px] leading-relaxed space-y-2 mb-4">
            <p>
              CODA no capta recursos del público, no custodia fondos, no asume riesgo crediticio
              y no concede crédito en cuenta propia. Las recomendaciones generadas por la plataforma
              no garantizan aprobación ni condiciones específicas por parte de las instituciones
              financieras. La decisión final de otorgamiento corresponde al proveedor del producto.
            </p>
          </div>

          {/* Copyright */}
          <div className="pt-4 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
            <span>&copy; {new Date().getFullYear()} Chile Open-Data Analytics SpA — CODA es una marca de WeGroup Holding.</span>
            <a href="mailto:info@codafinance.cl" className="hover:text-white mt-2 md:mt-0">
              info@codafinance.cl
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
