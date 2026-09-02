/**
 * D1 — Capa canónica. Contrato de datos único con procedencia por dato; los consumidores leen
 * de acá en vez de cada fuente cruda.
 */
export { buildCanonicalProfile } from "./buildCanonicalProfile.js";
export { assembleCanonicalProfile } from "./assembleCanonicalProfile.js";
export type {
  DataSourceId,
  Provenance,
  CanonicalFact,
  CanonicalProfile,
  CanonicalInputs,
  CanonicalIdentity,
  CanonicalIncome,
  CanonicalDebt,
  CanonicalEmployment,
} from "./types.js";
