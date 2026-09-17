/**
 * Proceso de workers: documentos (OCR/parseo) + conectores de fuentes (D1).
 *
 * Dos formas de correrlo, ambas requieren `REDIS_URL`:
 *  - Proceso aparte: `npm run worker -w @coda/api` (servicio `coda-document-worker` en render.yaml).
 *  - Dentro de la API: `RUN_WORKERS_IN_PROCESS=true` (ver index.ts). Evita pagar un servicio
 *    aparte, a cambio de que el OCR compita por CPU con las requests y de que en un plan que se
 *    duerme por inactividad la cola sólo avance mientras la API esté despierta.
 */

import { logger } from "../logger.js";
import { registerBuiltinConnectors } from "../connectors/sources/index.js";
import { startDocumentWorker } from "./documentWorker.js";
import { startConnectorWorker } from "./connectorWorker.js";

export function startWorkers(): void {
  // El worker corre los jobs de conectores: sin el registro acá, cada job muere con
  // "conector no registrado".
  registerBuiltinConnectors();
  startDocumentWorker();
  startConnectorWorker();
  logger.info("Workers iniciados (documentos + conectores)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkers();
}
