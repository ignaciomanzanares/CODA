# Política de retención de datos

| Dato | Retención | Mecanismo |
|---|---|---|
| Original subido (PDF/imagen) | **30 días** (`ORIGINAL_DOC_TTL_DAYS`) | `document_originals` + job `purgeExpiredOriginals` (cada 24h) borra del blob store los vencidos |
| Datos parseados (`document_uploads`, transacciones) | Mientras exista la cuenta | Se borran al cerrar/anonimizar la cuenta |
| Traza algorítmica (`algorithm_prediction_logs`) | **No se borra** (NCG 502) | Al cerrar cuenta se desvincula del usuario y se le quita la PII de entrada |
| Consentimientos (`consent_grants`, `privacy_consent_events`) | **No se borra** (prueba legal) | Solo se anonimiza IP/user-agent |
| Originales al cerrar cuenta | **Borrado inmediato** | `deleteOriginalsForUser` en `accountAnonymization` |

## Cierre de cuenta (Ley 19.628 / 21.719)

`anonymizeUser(userId)` (`services/privacy/accountAnonymization.ts`) borra cuentas/transacciones/
scores/documentos/originales/correcciones/snapshots de hábitos, anonimiza la fila de `users`
(tokens irreversibles) y desvincula la traza NCG 502 sin borrarla.

## Verificación

- Ningún original sobrevive > `ORIGINAL_DOC_TTL_DAYS` (el job lo borra).
- Tras cerrar cuenta, `document_originals` y los blobs del usuario quedan en 0.
