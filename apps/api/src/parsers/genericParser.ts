/**
 * Parser genérico por coordenadas (#20).
 *
 * Corre el MISMO motor compartido que los parsers por banco (`runBankParser` →
 * `parseCartolaPdfBuffer` → `parseCartolaPdf`, que detecta columnas/secciones por la posición X
 * de los items del PDF) pero SIN depender de un banco detectado, en modo `keyword_inferred` (el
 * más general: infiere cargo/abono por las glosas cuando no hay secciones separadas).
 *
 * Rol: **fallback** cuando `detectFormat` no reconoce el banco o no hay parser específico. Amplía
 * la cobertura a formatos no soportados sin tocar los parsers por banco, que siguen siendo el
 * camino PRIMARIO (mayor precisión cuando hay match). Hereda todos los gates de calidad de
 * `runBankParser` (confianza mínima, conciliación de saldos), así que solo devuelve un resultado
 * cuando el parseo es razonablemente bueno; si no, lanza ParseError y el caller cae al error
 * original ("no se reconoció el banco").
 */
import { type ParseResult } from "./base.js";
import { runBankParser } from "./bankParser.js";

export const GENERIC_BANCO = "Genérico";

/**
 * `banco_confidence = 0.70` posiciona el parseo en tier MEDIUM: se muestra el banner de revisión
 * en la UI y se propaga la incertidumbre a la confianza por transacción — apropiado para un
 * parseo genérico no atado a un layout conocido.
 */
export async function parseGeneric(buffer: Buffer, banco_confidence = 0.7): Promise<ParseResult> {
  return runBankParser(buffer, {
    banco: GENERIC_BANCO,
    banco_confidence,
    mode: "keyword_inferred",
  });
}
