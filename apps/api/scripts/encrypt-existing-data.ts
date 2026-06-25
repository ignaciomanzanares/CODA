/**
 * One-off: cifra in-place las columnas que `storage.ts`/`traceabilityPersistence.ts` empezaron a
 * cifrar (ver `services/crypto/fieldEncryption.ts`), para filas insertadas ANTES de ese cambio.
 *
 * Uso: `tsx apps/api/scripts/encrypt-existing-data.ts` (requiere `DATABASE_URL`/`FIELD_ENCRYPTION_KEY`
 * en el entorno — mismas variables que usa la API).
 *
 * Idempotente: cada columna se revisa con `looksEncrypted()` antes de cifrar, así que se puede
 * correr más de una vez sin doble-cifrar una fila ya migrada.
 *
 * Alcance actual (deliberado, ver services/audit/README.md):
 * - `users.firstName/lastName/totpSecret/backupCodes` — nunca se consultan por valor (a diferencia
 *   de `email`/`username`, que sí se usan en WHERE para login y quedan en texto plano por ahora).
 * - `document_uploads.parsedData` / `score_document_uploads.parsedData` — solo se leen por id/userId.
 * - `algorithm_prediction_logs.input_features/output_snapshot/cmf_data/sfa_data/top_factors`.
 *
 * Fuera de alcance en este pase (documentado, no silencioso): los RUT/nombres de contraparte en las
 * tablas `empresas_*` (`counterpartyRut`, `emitterRut`, `receiverRut`, `customerRut`, `vendorRut`) se
 * usan activamente en JOIN/WHERE/ORDER BY para el motor de conciliación de `routes-empresas.ts` —
 * cifrarlos con IV aleatorio rompería ese matching. Requieren un diseño de blind index (hash
 * determinístico adicional para igualdad) antes de cifrarse; no se tocan aquí.
 *
 * Patrón recomendado para datos reales en producción (no aplica hoy — la BD está casi vacía):
 * 1. Shadow column: agregar `<col>_encrypted` junto a la columna original.
 * 2. Dual-write: la app escribe en ambas mientras se hace el backfill.
 * 3. Backfill: este script (o uno análogo) rellena `<col>_encrypted` para filas viejas.
 * 4. Swap: renombrar `<col>_encrypted` -> `<col>` (o cambiar el código para leer la nueva columna)
 *    una vez que el backfill terminó y no quedan escritores de la columna vieja.
 * Como hoy no hay datos reales en producción, este script cifra in-place directamente (sin shadow
 * column) — es seguro porque no hay tráfico concurrente que dependa de leer texto plano.
 */

import { db, users, documentUploads, scoreDocumentUploads, algorithmPredictionLogs } from '../src/db/index.js';
import { encryptField, looksEncrypted } from '../src/services/crypto/fieldEncryption.js';

async function migrateUsers() {
  const rows = await db.select().from(users);
  let migrated = 0;
  for (const row of rows) {
    const update: Record<string, string | null> = {};
    for (const col of ['firstName', 'lastName', 'totpSecret', 'backupCodes'] as const) {
      const value = (row as Record<string, unknown>)[col];
      if (typeof value === 'string' && value.length > 0 && !looksEncrypted(value)) {
        update[col] = encryptField(value);
      }
    }
    if (Object.keys(update).length > 0) {
      await db.update(users).set(update).where(eq(users.id, row.id));
      migrated++;
    }
  }
  console.log(`users: ${migrated}/${rows.length} filas migradas`);
}

async function migrateDocumentUploads() {
  const rows = await db.select().from(documentUploads);
  let migrated = 0;
  for (const row of rows) {
    if (row.parsedData && !looksEncrypted(row.parsedData)) {
      await db.update(documentUploads).set({ parsedData: encryptField(row.parsedData) }).where(eq(documentUploads.id, row.id));
      migrated++;
    }
  }
  console.log(`document_uploads: ${migrated}/${rows.length} filas migradas`);
}

async function migrateScoreDocumentUploads() {
  const rows = await db.select().from(scoreDocumentUploads);
  let migrated = 0;
  for (const row of rows) {
    if (row.parsedData && !looksEncrypted(row.parsedData)) {
      await db.update(scoreDocumentUploads).set({ parsedData: encryptField(row.parsedData) }).where(eq(scoreDocumentUploads.id, row.id));
      migrated++;
    }
  }
  console.log(`score_document_uploads: ${migrated}/${rows.length} filas migradas`);
}

async function migrateAlgorithmPredictionLogs() {
  const rows = await db.select().from(algorithmPredictionLogs);
  let migrated = 0;
  for (const row of rows) {
    const update: Record<string, string | null> = {};
    for (const col of ['inputFeatures', 'outputSnapshot', 'cmfData', 'sfaData', 'topFactors'] as const) {
      const value = (row as Record<string, unknown>)[col];
      if (typeof value === 'string' && value.length > 0 && !looksEncrypted(value)) {
        update[col] = encryptField(value);
      }
    }
    if (Object.keys(update).length > 0) {
      await db.update(algorithmPredictionLogs).set(update).where(eq(algorithmPredictionLogs.id, row.id));
      migrated++;
    }
  }
  console.log(`algorithm_prediction_logs: ${migrated}/${rows.length} filas migradas`);
}

// drizzle-orm `eq` no está re-exportado arriba en todos los casos; import directo para el script.
import { eq } from 'drizzle-orm';

async function main() {
  await migrateUsers();
  await migrateDocumentUploads();
  await migrateScoreDocumentUploads();
  await migrateAlgorithmPredictionLogs();
  console.log('Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
