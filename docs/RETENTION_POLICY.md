# Política de retención de datos

| Dato | Retención | Mecanismo |
|---|---|---|
| Original subido (PDF/imagen) | **30 días** (`ORIGINAL_DOC_TTL_DAYS`) | `document_originals` + job `purgeExpiredOriginals` (cada 24h) borra del blob store los vencidos |
| Datos parseados (`document_uploads`, transacciones) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta |
| Traza algorítmica (`algorithm_prediction_logs`) | **No se borra** (NCG 502) | Al cerrar cuenta se desvincula del usuario y se le quita la PII de entrada |
| Consentimientos (`consent_grants`, `privacy_consent_events`) | **No se borra** (prueba legal) | Solo se anonimiza IP/user-agent |
| Originales al cerrar cuenta | **Borrado inmediato** | `deleteOriginalsForUser` en `accountAnonymization` |
| RUT del titular (`users.rut_hash`) | Mientras exista la cuenta | Se guarda como hash HMAC-SHA256 irreversible (nunca en texto plano, ver `services/crypto/identifierHashing.ts`); se limpia (`null`) al cerrar cuenta |
| Activos declarados (`user_assets`) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta |
| Jobs de OCR de inscripción (`inscripcion_jobs`) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta |
| Memoria/feedback del asistente IA (`assistant_summaries`, `assistant_feedback`) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta |
| Feedback de hábitos (`habit_feedback`) | Mientras exista la cuenta | Se borra al cerrar/anonimizar la cuenta |
| Diagnóstico de parseo (`document_parse_outcomes`, `parser_diagnostics`) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta |
| Eventos de conversión de productos (`product_conversion_events`) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta (el `ON DELETE CASCADE` de la tabla nunca se dispara solo, porque la fila de `users` no se borra — ver más abajo) |
| Rastro de seguridad (`audit_logs`) | **No se borra** (auditoría) | Al cerrar cuenta se desvincula del usuario (`user_id = null`); a diferencia de `algorithm_prediction_logs`, la FK es nullable así que no requiere usuario placeholder |

## Cierre de cuenta (Ley 19.628 / 21.719)

`anonymizeUser(userId)` (`services/privacy/accountAnonymization.ts`) borra cuentas/transacciones/
scores/documentos/originales/correcciones/snapshots de hábitos/activos declarados/jobs de
inscripción/memoria y feedback del asistente/feedback de hábitos/diagnósticos de parseo/eventos de
conversión de productos, anonimiza la fila de `users` (tokens irreversibles + `rut_hash = null`),
desvincula la traza NCG 502 y el rastro de auditoría (`audit_logs`) sin borrarlos.

**Nota sobre `ON DELETE CASCADE`:** algunas tablas (`user_assets`, `product_conversion_events`)
declaran `ON DELETE CASCADE` a nivel de base de datos, pero `anonymizeUser` nunca borra la fila de
`users` (la sobrescribe, para no romper las FKs de `algorithm_prediction_logs`/`consent_grants`
que sí se conservan) — por eso esas cascadas nunca se disparan solas y `anonymizeUser` las borra
explícitamente.

## Seudonimización del RUT

`users.rut_hash` es un HMAC-SHA256 (pepper `RUT_HASH_PEPPER`) del RUT normalizado — irreversible,
no permite recuperar el RUT original ni siquiera con acceso a la base de datos y al pepper (solo
permite comparar contra un RUT candidato). Reemplaza a la columna legacy `users.rut` (texto
plano); ver `migrations/035_users_rut_hash.sql` y `scripts/backfillRutHash.ts` para el rollout de
la migración de datos existentes.

## Alcance: CODA Empresas (B2B)

Esta política y `anonymizeUser` cubren solo el producto de personas (`users` y tablas asociadas).
CODA Empresas (`empresas_users`, `empresas_companies`, `empresas_*`) no tiene todavía un flujo de
borrado/anonimización — es una brecha conocida, pendiente de una decisión de producto sobre qué
pasa con la contabilidad/DTEs de la empresa al borrar un usuario. Los campos RUT del lado Empresas
(`empresas_companies.rut`, `counterparty_rut`, `emitter_rut`/`receiver_rut`, `customer_rut`,
`vendor_rut`) tampoco están seudonimizados todavía.

## Verificación

- Ningún original sobrevive > `ORIGINAL_DOC_TTL_DAYS` (el job lo borra).
- Tras cerrar cuenta, `document_originals` y los blobs del usuario quedan en 0.
- Tras cerrar cuenta, `user_assets`, `inscripcion_jobs`, `assistant_summaries`,
  `assistant_feedback`, `habit_feedback`, `document_parse_outcomes`, `parser_diagnostics` y
  `product_conversion_events` quedan en 0 filas para ese usuario; `audit_logs` conserva sus filas
  pero con `user_id = null`; `users.rut_hash` queda `null` (ver
  `services/privacy/__tests__/accountAnonymization.test.ts`).
