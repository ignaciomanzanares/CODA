/**
 * Rotación de FIELD_ENCRYPTION_KEY (#3.2).
 *
 * Procedimiento operacional:
 *   1. Generar llave nueva: `openssl rand -base64 32`.
 *   2. Desplegar con FIELD_ENCRYPTION_KEY=<nueva> y FIELD_ENCRYPTION_KEY_PREV=<vieja>.
 *      decryptField prueba la nueva y cae a la vieja → el servicio sigue leyendo todo.
 *   3. Correr este job (script scripts/rotate-encryption-key.ts): re-cifra con la nueva todo
 *      lo que aún esté cifrado con la vieja, en lotes.
 *   4. Tras completar, quitar FIELD_ENCRYPTION_KEY_PREV en el siguiente deploy.
 *
 * Solo re-cifra valores que `needsReencryption` marca (los autenticados por la llave vieja),
 * así es idempotente y se puede reanudar si se corta.
 */
import {
  db,
  users,
  documentUploads,
  scoreDocumentUploads,
  storedBlobs,
  algorithmPredictionLogs,
  transactions,
  bankConnections,
  eq,
} from '../../db/index.js';
import { decryptField, encryptField, needsReencryption } from './fieldEncryption.js';
import { ENCRYPTED_COLUMNS } from './encryptedColumnsRegistry.js';
import { logger } from '../../logger.js';

interface RotationTarget {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  idCol: string;
  cols: string[];
}

// Exportado para que keyRotationCoverage.test.ts pueda verificar que cada tabla del registro
// (encryptedColumnsRegistry.ts) está realmente wireada aquí, sin duplicar el mapeo en el test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLES_BY_NAME: Record<string, any> = {
  users,
  document_uploads: documentUploads,
  score_document_uploads: scoreDocumentUploads,
  stored_blobs: storedBlobs,
  algorithm_prediction_logs: algorithmPredictionLogs,
  transactions,
  bank_connections: bankConnections,
};

// PK de cada tabla — 'id' para todas salvo stored_blobs (PK 'key').
const ID_COL_BY_NAME: Record<string, string> = { stored_blobs: 'key' };

// TARGETS se construye desde ENCRYPTED_COLUMNS (registro único, compartido con storage.ts) para
// que una columna cifrada nueva se rote automáticamente en cuanto se agrega al registro — así se
// cierra la clase de bug que dejó `transactions` entero fuera de la rotación.
export const TARGETS: RotationTarget[] = ENCRYPTED_COLUMNS.map(({ table, cols }) => ({
  name: table,
  table: TABLES_BY_NAME[table],
  idCol: ID_COL_BY_NAME[table] ?? 'id',
  cols: [...cols],
}));

export interface RotationResult {
  scanned: number;
  reencryptedRows: number;
  reencryptedFields: number;
  perTable: Record<string, { rows: number; fields: number }>;
  dryRun: boolean;
}

/**
 * Re-cifra con la llave ACTUAL todo valor que aún esté cifrado con la anterior.
 * No-op si FIELD_ENCRYPTION_KEY_PREV no está configurada (needsReencryption → false siempre).
 */
export async function rotateEncryptionKey(opts?: { batchSize?: number; dryRun?: boolean }): Promise<RotationResult> {
  const batchSize = opts?.batchSize ?? 500;
  const dryRun = opts?.dryRun ?? false;
  const result: RotationResult = { scanned: 0, reencryptedRows: 0, reencryptedFields: 0, perTable: {}, dryRun };

  for (const t of TARGETS) {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = (await db.select().from(t.table)) as Record<string, unknown>[];
    } catch (e) {
      logger.warn({ err: e, table: t.name }, '[keyRotation] tabla no accesible, se omite');
      continue;
    }
    let tableRows = 0;
    let tableFields = 0;
    let pending = 0;

    for (const row of rows) {
      result.scanned++;
      const updates: Record<string, string> = {};
      for (const col of t.cols) {
        const val = row[col];
        if (typeof val === 'string' && val.length > 0 && needsReencryption(val)) {
          if (!dryRun) updates[col] = encryptField(decryptField(val));
          tableFields++;
        }
      }
      if (Object.keys(updates).length > 0 || (dryRun && tableFields > 0)) {
        if (!dryRun && Object.keys(updates).length > 0) {
          await db.update(t.table).set(updates).where(eq(t.table[t.idCol], row[t.idCol]));
        }
        tableRows++;
        pending++;
        if (pending >= batchSize) {
          logger.info({ table: t.name, rows: tableRows, fields: tableFields }, '[keyRotation] lote procesado');
          pending = 0;
        }
      }
    }

    result.perTable[t.name] = { rows: tableRows, fields: tableFields };
    result.reencryptedRows += tableRows;
    result.reencryptedFields += tableFields;
    logger.info({ table: t.name, rows: tableRows, fields: tableFields, dryRun }, '[keyRotation] tabla completa');
  }

  logger.info(result, '[keyRotation] rotación completa');
  return result;
}
