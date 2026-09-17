/**
 * Conectores de fuentes oficiales (D3/D5/D6). Se registran una vez al arrancar, tanto en la API
 * (para el camino en proceso) como en el worker (para el camino por cola) — si sólo se registran
 * en uno, el otro responde "conector no registrado".
 */

import { getConnector, registerConnector } from "../registry.js";
import { siiCarpetaConnector } from "./siiCarpeta.js";

export { siiCarpetaConnector, SII_CARPETA_CONNECTOR_ID } from "./siiCarpeta.js";

/** Idempotente: registrar dos veces (p. ej. workers dentro de la API) no lanza. */
export function registerBuiltinConnectors(): void {
  for (const connector of [siiCarpetaConnector]) {
    if (!getConnector(connector.id)) registerConnector(connector);
  }
}
