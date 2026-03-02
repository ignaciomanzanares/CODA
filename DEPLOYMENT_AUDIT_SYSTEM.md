# Despliegue del Sistema de Trazabilidad Algorítmica

**Fecha:** 2 de marzo de 2026  
**Versión:** 1.0  
**Responsable:** Equipo Técnico CODA

---

## Pre-requisitos

- ✅ PostgreSQL en producción (Render)
- ✅ API desplegada y funcionando
- ✅ Acceso a consola SQL de Render (o `psql` con `DATABASE_URL`)
- ✅ Node.js 18+ instalado localmente (para scripts)

---

## Paso 1: Aplicar Migración SQL

### Opción A: Desde Consola SQL de Render (Recomendado)

1. Ir a Render Dashboard → Tu database → **"SQL Shell"**
2. Copiar el contenido completo de `migrations/0004_add_audit_tables.sql`
3. Pegar en la consola y ejecutar
4. Verificar que las tablas se crearon:

```sql
\dt model_versions
\dt credit_score_predictions
\dt algorithm_changes
\dt feature_importance
\dt credit_score_disputes
\dt model_performance_metrics
```

Deberías ver las 6 tablas nuevas.

### Opción B: Desde línea de comando (psql)

```bash
# Obtener DATABASE_URL (External URL) de Render
export DATABASE_URL="postgresql://coda_user:password@dpg-xyz.virginia-postgres.render.com/coda_db?sslmode=require"

# Aplicar migración
psql "$DATABASE_URL" -f migrations/0004_add_audit_tables.sql

# Verificar
psql "$DATABASE_URL" -c "\dt model_versions"
```

### Opción C: Script automático (si tienes configurado)

```bash
# Desde la raíz del proyecto
npm run db:migrate
```

**Nota:** El script `scripts/run-migrations.mjs` ejecutará todas las migraciones `.sql` en orden.

---

## Paso 2: Rebuild y Deploy API

```bash
# Desde la raíz del proyecto
npm run build --workspace=@coda/api

# Commit cambios
git add .
git commit -m "feat: implement algorithmic traceability system (NCG 502 compliance)"
git push origin main
```

Render detectará el push y hará redeploy automático.

---

## Paso 3: Verificar Deploy

### 3.1 Logs de Inicio

En Render → Logs, busca:

```
🔍 Initializing Algorithmic Traceability System...
✅ Traceability system initialized
   Active model: simple_rules v1.0.0
📊 Registering audit & compliance routes...
✅ Audit routes registered
```

### 3.2 Health Check de API

```bash
curl https://your-api.onrender.com/health
```

Debe responder `200 OK`.

### 3.3 Test Endpoint de Auditoría

```bash
# Obtener token de autenticación
TOKEN="your-jwt-token"

# Test endpoint (debe devolver historial vacío al inicio)
curl -H "Authorization: Bearer $TOKEN" \
  https://your-api.onrender.com/api/audit/my-predictions
```

**Respuesta esperada:**
```json
{
  "predictions": [],
  "total": 0
}
```

### 3.4 Test Stats de Admin

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://your-api.onrender.com/api/audit/admin/stats
```

**Respuesta esperada:**
```json
{
  "stats": {
    "totalPredictions": 0,
    "predictionsLast24h": 0,
    "avgCreditScore": 0,
    "totalModelVersions": 1,
    "totalAlgorithmChanges": 0
  },
  "activeModel": {
    "version": "v1.0.0",
    "modelType": "simple_rules",
    "deployedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

## Paso 4: Deploy Frontend

```bash
# Desde la raíz del proyecto
npm run build --workspace=@coda/web

# Commit si hay cambios
git add apps/web/
git commit -m "feat: add audit dashboard UI"
git push origin main
```

Vercel detectará el push y hará redeploy automático.

---

## Paso 5: Verificar Frontend

1. Ir a `https://your-app.vercel.app/audit`
2. Deberías ver el dashboard de auditoría
3. Inicialmente estará vacío (sin predicciones)

---

## Paso 6: Test End-to-End

### 6.1 Subir Documento CMF

1. Login en la app: `/login`
2. Ir a Onboarding o Dashboard
3. Subir un documento CMF (`informe_deudas_*.pdf`)
4. Verificar que el score se calcule correctamente

### 6.2 Verificar Audit Log

1. Ir a `/audit`
2. Deberías ver la predicción recién creada
3. Verificar que muestre:
   - ✅ Credit score
   - ✅ Risk category
   - ✅ Timestamp
   - ✅ Top factors (explicación)
   - ✅ Versión del modelo (`v1.0.0`)
   - ✅ Confianza (confidence)

### 6.3 Verificar en Database

```sql
-- Conectar a Postgres
psql "$DATABASE_URL"

-- Ver predicciones registradas
SELECT 
  id, 
  user_id, 
  credit_score, 
  risk_category,
  model_version,
  decision_timestamp
FROM credit_score_predictions
ORDER BY decision_timestamp DESC
LIMIT 10;
```

Deberías ver la predicción que acabas de crear.

---

## Paso 7: Inicializar Datos de Audit (Opcional)

Para tener un historial inicial de cambios algorítmicos:

```bash
# Ejecutar script de inicialización
node scripts/init-audit-system.mjs
```

Este script:
- ✅ Registra cambios algorítmicos históricos (v1.0.0, v1.1.0)
- ✅ Muestra ejemplo de drift monitoring
- ✅ Verifica que el sistema esté funcionando

---

## Troubleshooting

### Error: "Tabla no existe"

**Problema:** Las tablas de audit no fueron creadas.

**Solución:**
```bash
# Aplicar migración manualmente
psql "$DATABASE_URL" -f migrations/0004_add_audit_tables.sql
```

### Error: "Cannot find module 'algorithmicTraceability'"

**Problema:** La API no se compiló correctamente.

**Solución:**
```bash
# Rebuild API
npm run build --workspace=@coda/api

# Verificar que exista el archivo compilado
ls apps/api/dist/src/services/audit/algorithmicTraceability.js
```

### Error: 500 en `/api/audit/*`

**Problema:** El sistema de audit no se inicializó.

**Solución:**
- Verificar logs de Render en startup
- Debe aparecer: "🔍 Initializing Algorithmic Traceability System..."
- Si no aparece, verificar que `index.ts` llame a `initializeTraceabilitySystem()`

### Dashboard `/audit` vacío

**Normal si:** No has subido ningún documento CMF aún.

**Si ya subiste CMF y sigue vacío:**
1. Verificar que el endpoint `/api/audit/my-predictions` responda
2. Verificar en DB que existan registros en `credit_score_predictions`
3. Verificar console del browser (F12) para errores

---

## Rollback (si algo falla)

### Rollback de Migración SQL

```sql
-- Eliminar tablas de audit (CUIDADO: borra datos)
DROP TABLE IF EXISTS model_performance_metrics;
DROP TABLE IF EXISTS credit_score_disputes;
DROP TABLE IF EXISTS feature_importance;
DROP TABLE IF EXISTS algorithm_changes;
DROP TABLE IF EXISTS credit_score_predictions;
DROP TABLE IF EXISTS model_versions;
```

### Rollback de Código

```bash
# Revertir commit
git revert HEAD
git push origin main
```

---

## Siguientes Pasos

Una vez desplegado exitosamente:

1. **Migrar de in-memory a PostgreSQL:**
   - Actualizar `algorithmicTraceability.ts` para usar Drizzle queries
   - Reemplazar `TraceabilityStore` (in-memory) con DB persistence

2. **Implementar roles de admin:**
   - Agregar campo `role` a tabla `users`
   - Proteger endpoints `/api/audit/admin/*` con middleware `requireAdmin()`

3. **Activar monitoring de drift:**
   - Configurar cron job diario: `runDriftMonitoringJob()`
   - Alertas por email/Slack si drift > umbral

4. **Dashboard de admin:**
   - Crear `/admin/audit` con visualizaciones avanzadas
   - Gráficos de drift, distribución de scores, etc.

5. **Exportación PDF para CMF:**
   - Implementar generación de reportes PDF con audit trail
   - Incluir en reporte NCG 530

---

## Soporte

Para ayuda con el despliegue:

- **Equipo Técnico:** Ignacio Manzanares
- **Documentación:** `ALGORITHMIC_TRACEABILITY.md`
- **Código:** `apps/api/src/services/audit/`

---

**¡Sistema de Trazabilidad Algorítmica listo para cumplimiento CMF NCG 502!**
