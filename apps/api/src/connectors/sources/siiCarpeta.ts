/**
 * D5 (obtención) — Conector de la Carpeta Tributaria Electrónica del SII.
 *
 * Cómo funciona la carpeta: el contribuyente la genera en sii.cl con su clave tributaria y le
 * llegan al RECEPTOR un CÓDIGO (por correo del SII) y una CLAVE (que comparte el emisor). Con eso,
 * un tercero revisa la carpeta en el sitio del SII mientras esté vigente. CODA es ese receptor.
 *
 * Por qué importa: es la única vía que ya existe para traer renta declarada SIN pedirle la
 * ClaveÚnica al usuario (intransferible, y automatizarla a escala es una decisión legal abierta).
 * El usuario delega un secreto acotado y revocable, no su identidad.
 *
 * Reparto del trabajo: el PARSEO de la carpeta ya existe (`services/dataSources/govParsers.ts`,
 * F22 y boletas de honorarios). Acá vive la OBTENCIÓN: secreto en la bóveda, gate de
 * consentimiento + traza (vía `withSourceAccess`, que lo aplica el runner), parseo y persistencia.
 *
 * Lo que falta: `fetchCarpetaPdf` contra el sitio real. La página del receptor no está en el HTML
 * estático del SII (el menú se arma por JS), así que hay que capturarla con una carpeta real —
 * mismo patrón que los adapters del scraper: mientras no esté, lanza y no finge datos. Ver el
 * runbook al final de este archivo.
 */

import { getSecret } from "../../services/secrets/connectorSecretVault.js";
import type { ConnectorRunContext, SourceConnector } from "../registry.js";

export const SII_CARPETA_CONNECTOR_ID = "sii-carpeta";

/** Campos que el titular delega. Viven cifrados en `connector_secrets`, nunca en logs. */
export interface CarpetaSecret {
  /** Código de la carpeta que el SII manda por correo al receptor. */
  codigo: string;
  /** Clave que define/comparte el contribuyente emisor. */
  clave: string;
}

export class PendingFetchError extends Error {
  readonly code = "pending_fetch";
  constructor(step: string) {
    super(`sii-carpeta.${step}: pendiente — capturar el flujo del receptor con una carpeta real`);
    this.name = "PendingFetchError";
  }
}

/** El secreto guardado no tiene la forma que espera el conector. */
export class InvalidSecretShapeError extends Error {
  readonly code = "invalid_secret_shape";
  constructor() {
    super("El secreto de la carpeta tributaria no trae código y clave.");
    this.name = "InvalidSecretShapeError";
  }
}

export function asCarpetaSecret(raw: Record<string, string>): CarpetaSecret {
  const codigo = raw.codigo?.trim();
  const clave = raw.clave?.trim();
  if (!codigo || !clave) throw new InvalidSecretShapeError();
  return { codigo, clave };
}

/**
 * Baja el PDF de la carpeta desde el SII con el código + clave del receptor.
 * PENDIENTE hasta capturar el flujo real (ver runbook).
 */
export async function fetchCarpetaPdf(_secret: CarpetaSecret): Promise<Buffer> {
  throw new PendingFetchError("fetchCarpetaPdf");
}

export interface CarpetaRunResult {
  source: "sii";
  /** Resumen, no los datos: el resultado del job vive en Redis. */
  verifiedMonthlyIncomeClp: number | null;
  paginas: number;
}

/**
 * Trae la carpeta, la parsea con el parser que ya existe y la persiste como fuente verificada.
 * El gate de consentimiento (`sii_tax_data`) y la traza los aplica el runner, no este código.
 */
export async function runSiiCarpeta(ctx: ConnectorRunContext): Promise<CarpetaRunResult> {
  const secret = asCarpetaSecret(await getSecret(ctx.userId, SII_CARPETA_CONNECTOR_ID));
  const pdf = await fetchCarpetaPdf(secret);

  const { extractPdfText } = await import("../../services/documents/pdfAnalysis.js");
  const { text, numPages } = await extractPdfText(pdf);

  const { parseGovDocument } = await import("../../services/dataSources/govParsers.js");
  const parsed = parseGovDocument("sii", text);
  if (!parsed.ok) {
    throw new Error(parsed.message ?? "No se pudieron extraer los datos de la carpeta tributaria.");
  }

  const { saveGovSourceData } = await import("../../services/dataSources/govSourceService.js");
  await saveGovSourceData(ctx.userId, parsed);

  return {
    source: "sii",
    verifiedMonthlyIncomeClp: parsed.verifiedMonthlyIncomeClp ?? null,
    paginas: numPages,
  };
}

export const siiCarpetaConnector: SourceConnector<CarpetaRunResult> = {
  id: SII_CARPETA_CONNECTOR_ID,
  resourceType: "sii_tax_data",
  run: runSiiCarpeta,
  /**
   * Un código/clave que el SII no acepta, una carpeta vencida o revocada por el emisor, o un
   * secreto mal guardado no se arreglan reintentando: el usuario tiene que compartirla de nuevo.
   * Lo demás (timeout, 5xx del SII) sí.
   */
  isRetryable(err: unknown) {
    const code = (err as { code?: string })?.code;
    return !(
      code === "pending_fetch" ||
      code === "invalid_secret_shape" ||
      code === "secret_missing" ||
      code === "secret_expired"
    );
  },
};

/*
 * RUNBOOK — completar `fetchCarpetaPdf` (necesita una carpeta real vigente)
 *
 * 1. El titular genera en sii.cl una "Carpeta Tributaria para solicitar créditos" dirigida al
 *    correo del receptor. Le llega el CÓDIGO por correo; la CLAVE la define él.
 * 2. El secreto NO se pega en un chat ni se commitea (este repo es público): entra por
 *    `POST /api/data-sources/sii-carpeta/secreto` (queda cifrado en la bóveda) o, para la captura
 *    local, por variables de entorno del proceso.
 * 3. Capturar el flujo del receptor con el navegador abierto en la página de revisión del SII:
 *    anotar URL real, nombre de los campos del formulario, si hay captcha, y si la respuesta es
 *    HTML o el PDF directo. Volcar la ESTRUCTURA con los valores enmascarados.
 * 4. Implementar acá el POST del formulario y devolver los bytes del PDF. Si el SII exige captcha,
 *    esta vía queda descartada para automatizar: el camino sigue siendo que el usuario suba el PDF
 *    (`POST /api/data-sources/sii`), que ya funciona.
 * 5. Borrar el `PendingFetchError` recién cuando el fetch real funcione punta a punta.
 */
