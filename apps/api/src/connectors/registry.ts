/**
 * D1 — Registro de conectores de fuentes que pueden correr SIN el titular presente (desde la cola
 * de jobs): CMF, SII, AFC… Cada conector declara qué recurso consentido consulta; el runner
 * (`runConnector.ts`) lo ejecuta siempre dentro de `withSourceAccess` (gate D2 + traza por consulta).
 *
 * El scraper bancario NO se registra acá: exige MFA con el usuario presente y credenciales en
 * memoria, así que corre en el request (`connectors/scraper/scrapeAndIngest.ts`), no en la cola.
 */

import type { ConsentResourceType } from "../services/consent/types.js";

export interface ConnectorRunContext {
  userId: string;
  /** Id de la consulta en la traza (`audit_logs.entity_id`), para correlacionar logs. */
  accessId: string;
  /** Grant de consentimiento que autorizó esta consulta. */
  consentGrantId: number;
}

export interface SourceConnector<R = unknown> {
  /** Id estable (va a la traza y al job). */
  id: string;
  /** Recurso consentido que consulta: sin grant vigente para esto, no corre. */
  resourceType: ConsentResourceType;
  /**
   * Trae los datos e ingiere a las tablas canónicas. Lo que devuelve queda como resultado del
   * job en Redis → devolver un RESUMEN chico (conteos, fechas), nunca los datos crudos.
   */
  run(ctx: ConnectorRunContext): Promise<R>;
  /** ¿Vale la pena reintentar este error? Default: sí (salvo consentimiento faltante). */
  isRetryable?(err: unknown): boolean;
}

const connectors = new Map<string, SourceConnector>();

export function registerConnector(connector: SourceConnector): void {
  if (connectors.has(connector.id)) {
    throw new Error(`Conector duplicado: '${connector.id}'`);
  }
  connectors.set(connector.id, connector);
}

export function getConnector(id: string): SourceConnector | undefined {
  return connectors.get(id);
}

export function listConnectors(): SourceConnector[] {
  return [...connectors.values()];
}

/** Sólo para tests. */
export function clearConnectors(): void {
  connectors.clear();
}
