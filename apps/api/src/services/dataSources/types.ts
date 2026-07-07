/**
 * Fuentes de datos institucionales conectables por el usuario (Fase 5): AFP, SII, Tesorería (TGR).
 * El usuario descarga el PDF oficial con Clave Única y lo sube — NO manejamos sus credenciales
 * (consistente con "el usuario nunca entrega credenciales" del deck).
 */

export type GovSource = 'afp' | 'sii' | 'tgr';

export const GOV_SOURCE_LABELS: Record<GovSource, string> = {
  afp: 'AFP — Certificado de cotizaciones',
  sii: 'SII — Carpeta tributaria / renta',
  tgr: 'Tesorería — Certificado de deuda fiscal',
};

/** Resultado normalizado del parseo de un documento de fuente gov. Never-throw: si no se pudo
 *  extraer, `ok=false` + `message`. Los campos son los que alimentan los ratios de salud. */
export interface GovParseResult {
  source: GovSource;
  ok: boolean;
  /** SII: renta líquida/12. AFP: renta imponible promedio. */
  verifiedMonthlyIncomeClp?: number | null;
  /** TGR: deuda fiscal vigente (0 si el certificado indica que no registra deuda). */
  fiscalDebtClp?: number | null;
  /** AFP: meses con cotizaciones (proxy de estabilidad de ingresos). */
  contributionMonths?: number | null;
  /** Campos crudos extraídos, para auditoría / debugging del parser. */
  raw: Record<string, unknown>;
  message?: string;
}

/**
 * Interfaz para un proveedor de datos gov "en vivo" (API/scraper), lista para cuando exista.
 * Hoy la única implementación es el upload de PDF (govPdfProvider), pero un futuro conector por
 * API implementaría esta misma interfaz sin tocar los consumidores aguas abajo — mismo patrón que
 * OBProvider para open banking.
 */
export interface GovDataProvider {
  readonly source: GovSource;
  /** Obtiene y normaliza los datos de la fuente para un usuario. */
  fetch(userId: string): Promise<GovParseResult>;
}
