/**
 * Fuente única de verdad: qué tabla/columna se cifra con `encryptField` en todo el código.
 *
 * `keyRotation.ts` construye su lista de rotación a partir de este registro en vez de mantener
 * una segunda lista manual — así una columna cifrada nueva que se agregue en `storage.ts` (u
 * otro service) queda cubierta por la rotación en cuanto se agrega aquí, sin depender de que
 * alguien se acuerde de tocar `keyRotation.ts` también (la causa original del bug donde
 * `transactions` entero quedó fuera de la rotación).
 *
 * Al agregar un `encryptField`/`encryptFieldOrNull` nuevo sobre una columna: agregarla aquí en
 * el mismo cambio. `keyRotationCoverage.test.ts` no puede detectar un olvido automáticamente
 * (no hay forma de introspectar estáticamente todos los call-sites de encryptField vía test) —
 * es una disciplina de revisión, no una garantía de compilador.
 */
export const ENCRYPTED_COLUMNS = [
  { table: 'users', cols: ['firstName', 'lastName', 'totpSecret', 'backupCodes'] },
  { table: 'document_uploads', cols: ['parsedData'] },
  { table: 'score_document_uploads', cols: ['parsedData'] },
  { table: 'stored_blobs', cols: ['data'] },
  { table: 'algorithm_prediction_logs', cols: ['inputFeatures', 'outputSnapshot', 'cmfData'] },
  { table: 'transactions', cols: ['description', 'merchantName', 'raw'] },
  { table: 'bank_connections', cols: ['connectionData'] },
] as const;
