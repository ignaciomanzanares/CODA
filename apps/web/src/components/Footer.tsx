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
              Tu asistente financiero automatizado. Diagnóstico, plan de mejora y
              marketplace de productos financieros.
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
                <Link href={ROUTES.infoRiesgoSeguros} className="text-gray-300 hover:text-white">
                  Riesgo de seguros
                </Link>
              </li>
              <li>
                <Link href={ROUTES.infoMetasFinancieras} className="text-gray-300 hover:text-white">
                  Metas financieras
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
            <h4 className="text-white font-medium mb-4">Recursos</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={ROUTES.acerca} className="text-gray-300 hover:text-white">
                  Sobre Nosotros
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={ROUTES.privacidad} className="text-gray-300 hover:text-white">
                  Política de privacidad
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

        {/* Disclaimers regulatorios obligatorios */}
        <div className="mt-8 pt-6 border-t border-gray-700 space-y-3">
          <div className="text-gray-400 text-xs leading-relaxed space-y-2">
            <p>
              <strong className="text-gray-300">Chile Open-Data Analytics SpA</strong> — RUT 78.389.632-K
            </p>
            <p>
              CODA no capta recursos del público, no custodia fondos, no asume riesgo crediticio
              y no concede crédito en cuenta propia.
            </p>
            <p>
              Las recomendaciones generadas por CODA no garantizan aprobación ni condiciones
              específicas de un producto financiero. La decisión final de otorgamiento
              corresponde siempre al proveedor financiero.
            </p>
            <p>
              CODA genera ingresos por comisiones de originación y acuerdos de revenue sharing
              con instituciones financieras proveedoras de productos. El usuario final no paga
              por el servicio.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-400 text-xs mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Chile Open-Data Analytics SpA. Todos los derechos reservados.
          </div>
        </div>
      </div>
    </footer>
  );
}
