/**
 * D1 — Contrato de datos canónico.
 *
 * Representación NORMALIZADA y única del perfil financiero, con PROCEDENCIA por dato (fuente,
 * frescura, confianza). Unifica lo que hoy está disperso (userFinancialSources, parse CMF,
 * transacciones, reconciliación D7). "Todo lo demás se enchufa acá": los consumidores leen este
 * contrato, no cada fuente cruda.
 *
 * Cada hecho es un `CanonicalFact<T>` = valor + de dónde salió. Eso permite auditar por qué el
 * perfil dice lo que dice y qué tan confiable es cada campo.
 */

/** Fuentes de datos del ecosistema. */
export type DataSourceId =
  | "cmf" // Informe de Deudas CMF
  | "sii" // Carpeta tributaria / renta
  | "afp" // Cotizaciones AFP
  | "afc" // Seguro de cesantía (vínculo laboral)
  | "tgr" // Tesorería (deuda fiscal)
  | "cartola" // Movimientos bancarios observados
  | "user_declared" // Declarado por el usuario (activos, etc.)
  | "reconciled" // Resultado de reconciliar varias fuentes (D7)
  | "registro_civil"; // Identidad

export interface Provenance {
  source: DataSourceId;
  /** ISO timestamp de la extracción/observación (null si desconocido). */
  asOf: string | null;
  /** 0–1: confianza en este dato (de D7 para renta; base por fuente para el resto). */
  confidence: number;
}

/** Un hecho canónico: el valor + su procedencia. */
export interface CanonicalFact<T> {
  value: T;
  provenance: Provenance;
}

export interface CanonicalIdentity {
  rut?: CanonicalFact<string>;
  nombre?: CanonicalFact<string>;
}

export interface CanonicalIncome {
  /** Ingreso mensual reconciliado (CLP). */
  mensualClp?: CanonicalFact<number>;
}

export interface CanonicalDebt {
  /** Deuda total (CMF directa/indirecta + fiscal TGR). */
  totalClp?: CanonicalFact<number>;
  moraActiva?: CanonicalFact<boolean>;
}

export interface CanonicalEmployment {
  /** Meses cotizados (proxy de continuidad laboral). */
  cotizacionMeses?: CanonicalFact<number>;
}

/** Perfil financiero canónico completo. Todos los dominios son opcionales según qué fuentes haya. */
export interface CanonicalProfile {
  userId: string;
  identidad: CanonicalIdentity;
  renta: CanonicalIncome;
  deuda: CanonicalDebt;
  empleo: CanonicalEmployment;
  /** Fuentes que efectivamente aportaron algún dato. */
  sources: DataSourceId[];
  assembledAt: string;
}

/** Insumos ya obtenidos (raw) para construir el perfil canónico. Los provee el assembler DB. */
export interface CanonicalInputs {
  rut?: string | null;
  nombre?: string | null;
  /** Ingreso reconciliado (D7): valor + fuente elegida + confianza + frescura. */
  income?: {
    monthlyClp: number;
    source: DataSourceId;
    confidence: number;
    asOf: string | null;
  } | null;
  /** Deuda total en CLP (CMF + fiscal) y su procedencia. */
  debtTotalClp?: number | null;
  moraActiva?: boolean | null;
  debtAsOf?: string | null;
  /** Empleo: meses cotizados (AFP/AFC) + frescura. */
  cotizacionMeses?: number | null;
  employmentAsOf?: string | null;
}
