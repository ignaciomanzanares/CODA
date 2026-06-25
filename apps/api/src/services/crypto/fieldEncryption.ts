/**
 * Cifrado de columna (pseudonimización reversible) para PII y datos financieros sensibles.
 *
 * AES-256-GCM con llave maestra desde `FIELD_ENCRYPTION_KEY` (mismo patrón operacional que
 * `JWT_SECRET`: variable de entorno, no KMS externo). Cada valor cifrado usa un IV aleatorio
 * propio, por lo que dos valores iguales producen ciphertexts distintos (no se puede usar para
 * buscar por igualdad directamente sobre la columna cifrada).
 *
 * Formato de salida: `iv:authTag:ciphertext`, cada segmento en base64.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from '../../env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM

/** Deriva una llave de 32 bytes desde `FIELD_ENCRYPTION_KEY` sin importar su longitud/encoding original. */
function deriveKey(): Buffer {
  return createHash('sha256').update(env.fieldEncryptionKey).digest();
}

const key = deriveKey();

/** Cifra un string en claro. Devuelve `iv:authTag:ciphertext` (base64). */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Descifra un valor producido por `encryptField`. */
export function decryptField(value: string): string {
  const parts = value.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptField: formato inválido (esperado iv:authTag:ciphertext)');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Variantes null-safe para columnas opcionales. */
export function encryptFieldOrNull(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  return encryptField(plaintext);
}

export function decryptFieldOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return decryptField(value);
}

/** Heurística para distinguir valores ya cifrados de texto plano (migración / lecturas mixtas). */
export function looksEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9+/]*=*$/.test(p) && p.length > 0);
}
