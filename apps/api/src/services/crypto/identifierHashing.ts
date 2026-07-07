/**
 * Seudonimización irreversible de identificadores nacionales (RUT).
 *
 * A diferencia de `fieldEncryption.ts` (cifrado reversible), esto es un HMAC-SHA256 con pepper:
 * no existe forma de recuperar el RUT original a partir del hash, ni siquiera con acceso a la
 * base de datos y al pepper (solo permite volver a calcular el hash de un RUT candidato y
 * comparar). Usado para el "binding de identidad" entre uploads de Informe CMF sin guardar el
 * RUT en texto plano.
 */

import { createHmac } from 'crypto';
import { env } from '../../env.js';

/** Mismo criterio de normalización usado antes en documentUploadService.ts: quita puntos/espacios, mayúsculas, conserva el guion. */
export function normalizeRut(rut: string): string {
  return rut.replace(/[.\s]/g, '').toUpperCase();
}

/** HMAC-SHA256(rut_normalizado, RUT_HASH_PEPPER), hex. Determinístico: mismo RUT → mismo hash siempre. */
export function hashRut(rut: string): string {
  return createHmac('sha256', env.rutHashPepper).update(normalizeRut(rut)).digest('hex');
}
