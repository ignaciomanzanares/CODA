import { Link } from "wouter";
import { Wallet } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 py-8 safe-x">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <Wallet className="text-white mr-2" />
              <h3 className="text-white font-bold text-lg font-sans">CODA</h3>
            </div>
            <p className="text-gray-300 text-sm">
              Tu asistente financiero inteligente. Diagnóstico, scoring,
              plan de mejora y marketplace de productos financieros.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Funcionalidades</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={ROUTES.infoScoreCredito} className="text-gray-300 hover:text-white">
                  Score crediticio
                </Link>
              </li>
              <li>
                <Link href={ROUTES.productos} className="text-gray-300 hover:text-white">
                  Productos
                </Link>
              </li>
              <li>
                <Link href={ROUTES.infoComparacionProductos} className="text-gray-300 hover:text-white">
                  Comparación de productos
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Compañía</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-gray-300 hover:text-white">
                  Inicio
                </Link>
              </li>
              <li>
                <Link href={ROUTES.acerca} className="text-gray-300 hover:text-white">
                  Nosotros
                </Link>
              </li>
              <li>
                <Link href={ROUTES.instituciones} className="text-gray-300 hover:text-white">
                  Instituciones
                </Link>
              </li>
              <li>
                <Link href={ROUTES.metodologia} className="text-gray-300 hover:text-white">
                  Metodología
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={ROUTES.privacidad} className="text-gray-300 hover:text-white">
                  Privacidad
                </Link>
              </li>
              <li>
                <Link href={ROUTES.terminos} className="text-gray-300 hover:text-white">
                  Términos y Condiciones
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Separador + bloque legal completo */}
        <div className="mt-8 pt-6 border-t border-gray-700">
          {/* Fila 1: Links */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-4">
            <Link href="/" className="hover:text-white">Inicio</Link>
            <span className="text-gray-600">&middot;</span>
            <Link href={ROUTES.acerca} className="hover:text-white">Nosotros</Link>
            <span className="text-gray-600">&middot;</span>
            <Link href={ROUTES.infoScoreCredito} className="hover:text-white">Score crediticio</Link>
            <span className="text-gray-600">&middot;</span>
            <Link href={ROUTES.productos} className="hover:text-white">Productos</Link>
            <span className="text-gray-600">&middot;</span>
            <Link href={ROUTES.privacidad} className="hover:text-white">Privacidad</Link>
            <span className="text-gray-600">&middot;</span>
            <Link href={ROUTES.terminos} className="hover:text-white">Términos</Link>
          </div>

          {/* Fila 2: Identificación */}
          <p className="text-gray-400 text-xs mb-1">
            <strong className="text-gray-300">Chile Open-Data Analytics SpA</strong> &middot; RUT 78.389.632-K
          </p>
          <p className="text-gray-500 text-xs mb-4">
            Inscripción como prestador Fintec ante la CMF en trámite.
          </p>

          {/* Fila 3: Disclaimers regulatorios */}
          <div className="text-gray-500 text-[11px] leading-relaxed space-y-2 mb-4">
            <p>
              CODA no capta recursos del público, no custodia fondos, no asume riesgo crediticio
              y no concede crédito en cuenta propia. Las recomendaciones generadas por la plataforma
              no garantizan aprobación ni condiciones específicas por parte de las instituciones
              financieras. La decisión final de otorgamiento corresponde al proveedor del producto.
            </p>
          </div>

          {/* Fila 4: Copyright + contacto */}
          <div className="pt-4 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
            <span>&copy; {new Date().getFullYear()} CODA. Todos los derechos reservados.</span>
            <a href="mailto:info@codafinance.cl" className="hover:text-white mt-2 md:mt-0">
              info@codafinance.cl
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
