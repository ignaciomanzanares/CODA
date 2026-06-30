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
import { db, users, documentUploads, scoreDocumentUploads, storedBlobs, algorithmPredictionLogs, eq } from '../../db/index.js';
import { decryptField, encryptField, needsReencryption } from './fieldEncryption.js';
import { logger } from '../../logger.js';

interface RotationTarget {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  idCol: string;
  cols: string[];
}

// Columnas cifradas con encryptField en todo el código (ver storage.ts, traceabilityPersistence.ts, blobStore.ts).
const TARGETS: RotationTarget[] = [
  { name: 'users', table: users, idCol: 'id', cols: ['firstName', 'lastName', 'totpSecret', 'backupCodes'] },
  { name: 'document_uploads', table: documentUploads, idCol: 'id', cols: ['parsedData'] },
  { name: 'score_document_uploads', table: scoreDocumentUploads, idCol: 'id', cols: ['parsedData'] },
  { name: 'stored_blobs', table: storedBlobs, idCol: 'key', cols: ['data'] },
  { name: 'algorithm_prediction_logs', table: algorithmPredictionLogs, idCol: 'id', cols: ['inputFeatures', 'outputSnapshot', 'cmfData'] },
];

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
