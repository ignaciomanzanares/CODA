# Disaster Recovery — RTO / RPO

## Objetivos

| Métrica | Objetivo | Mecanismo |
|---|---|---|
| **RTO** (Recovery Time Objective) — tiempo máximo de indisponibilidad | ≤ 4 horas | Restauración point-in-time de Neon + redeploy de Render (runbook abajo) |
| **RPO** (Recovery Point Objective) — pérdida máxima de datos aceptable | ≤ 1 hora | Point-in-time recovery (PITR) de Neon (WAL continuo, no backups diarios) |

Antes de este documento no había RTO/RPO definido — el checklist de auditoría externa lo identificó como brecha (hallazgo #4). Estos objetivos son una propuesta inicial, no un SLA contractual; deben revisarse con el dueño del producto si CODA pasa a manejar volumen/usuarios reales.

## Componentes con estado a recuperar

| Componente | Dónde vive | Estrategia de recuperación |
|---|---|---|
| Postgres (datos de usuarios, scores, documentos) | Neon | PITR (ver abajo) |
| Redis (`coda-redis`, Render Key Value) | Render | Sin PITR — es estado efímero (OTP de 2FA, rate limits, jobs en cola). Un Redis vacío tras un incidente es aceptable: los rate limits se reconstruyen solos, los códigos OTP en vuelo se reenvían, y los jobs de documentos en curso se reintentan (el cliente vuelve a subir el documento; no hay pérdida de datos persistidos, solo de trabajo en progreso). Si `REDIS_URL` no está disponible, el OTP cae a un Map en memoria (single-process). |
| API (`coda-api`) y worker (`coda-document-worker`) / configuración | Git (GitHub) + `render.yaml` | Redeploy desde el commit en `main`; no requiere restauración, ya está versionado. |
| Frontend web | Git (GitHub) + Vercel | Redeploy automático desde `main`; sin estado propio. |
| Artefactos ML (`apps/api/src/ml/artifacts/`) | Git (versionados en el repo) | Mismo mecanismo que el código. |

El RPO de 1h aplica a Postgres — es el único componente con datos persistentes no reconstruibles desde otra fuente.

## Plan de Neon y PITR

- **Plan free de Neon**: PITR limitado a ~24h de historial (suficiente para el RPO de 1h objetivo, pero el límite de retención es de horas, no días — si se necesita un RPO más laxo con ventana de restauración más larga, ej. para auditoría legal histórica, hay que subir a un plan paid de Neon con mayor retención).
- **Acción pendiente**: confirmar en el dashboard de Neon el plan actualmente activo para este proyecto y documentar aquí la retención real (este documento asume el comportamiento estándar del free tier hasta que se confirme).

## Runbook de restauración

1. **Detectar el incidente** — alerta de `/health` caído, corrupción de datos reportada, o error humano (ej. migración mal aplicada, `DELETE` sin `WHERE`).
2. **Determinar el punto de restauración** — la marca de tiempo (UTC) inmediatamente anterior al incidente.
3. **Restaurar en un branch de Neon, NO en producción directamente**:
   - Neon dashboard → proyecto → *Branches* → *Create branch* → *Point in time* → seleccionar el timestamp del paso 2.
   - Esto crea una copia aislada; la base de producción original sigue intacta y disponible.
4. **Validar el branch restaurado**: conectarse con `psql` (o un cliente de tu preferencia) al connection string del branch nuevo y verificar que los datos esperados están presentes y el incidente no se replicó (ej. confirmar que la tabla afectada tiene las filas esperadas, no las corruptas).
5. **Promover el branch restaurado a producción**:
   - Opción A (rápida): actualizar `DATABASE_URL` en el Render Dashboard (servicios `coda-api` y `coda-document-worker`) para apuntar al connection string del branch restaurado, y redeploy.
   - Opción B (definitiva): en Neon, promover el branch restaurado como el branch principal (`main`), de forma que el connection string original vuelva a apuntar a los datos correctos sin tocar `DATABASE_URL` en Render.
6. **Verificar** `GET /health` y un smoke test manual (login, ver dashboard de un usuario de prueba).
7. **Post-mortem**: registrar la causa raíz, el timestamp restaurado, y el tiempo real que tomó cada paso (para refinar el RTO objetivo con datos reales en vez de una estimación).

## Ejercicio de restauración

**Pendiente de ejecutar** — no se ha corrido aún un ejercicio de restauración real. Próximo paso: ejecutar el runbook completo (pasos 2–4) contra un branch de Neon de prueba (no producción), con datos sintéticos, y registrar aquí:

- Fecha del ejercicio:
- Tiempo total (creación de branch → datos validados):
- Problemas encontrados en el runbook (pasos imprecisos, permisos faltantes, etc.):

Hasta que este ejercicio se ejecute y registre, el RTO de 4h es una estimación basada en la documentación de Neon/Render, no un número medido.

## Por qué `plan: starter` (no `free`) en `render.yaml`

Los planes `free` de Render suspenden el proceso por inactividad (servicios `web`) — un RTO de 4h es incompatible con un cold-start no acotado tras cada período sin tráfico. El worker de documentos (`coda-document-worker`) tiene el mismo problema: si se suspende, los jobs encolados en Redis no se procesan hasta el próximo request entrante (que no existe, porque es un worker sin endpoint HTTP). Redis (`coda-redis`) en plan free tampoco garantiza persistencia confiable entre restarts del add-on. Los tres servicios subieron a `starter` por esto, no solo por capacidad de CPU/memoria.

## Connection pooling de Neon

- Usar el connection string con **`-pooler`** de Neon (PgBouncer) en `DATABASE_URL` — soporta más conexiones concurrentes que el endpoint directo.
- Dimensionar `PG_POOL_MAX` (default 8, ver `apps/api/src/db/index.ts`) por instancia de modo que `numInstances * PG_POOL_MAX` ≤ el límite de conexiones del tier de Neon. En el plan actual, 8 por instancia con 1 instancia deja margen; al escalar a más instancias (#38), recalcular.

## Ejercicio automatizado de restauración (`scripts/neon-restore-drill.sh`)

Neon ofrece *point-in-time restore* vía branches. El script `scripts/neon-restore-drill.sh` automatiza el ensayo para obtener un RTO medible (no estimado):

```bash
NEON_API_KEY=... NEON_PROJECT_ID=... scripts/neon-restore-drill.sh
```

Crea un branch de Neon desde un timestamp pasado (default: 60 min atrás, configurable con `RESTORE_MINUTES_AGO`), espera a que el endpoint esté listo, imprime su connection string y mide el tiempo total — el RTO real. **No toca producción** (solo crea un branch aislado) e imprime el comando de limpieza para borrarlo al terminar. Correrlo trimestralmente y registrar el número arriba (hoy el RTO de 4h sigue siendo una estimación hasta que se ejecute).
