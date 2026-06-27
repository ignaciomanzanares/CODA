# Gestión de secretos con Doppler (#26)

Hoy los secretos de producción (claves de API, `JWT_SECRET`, `DATABASE_URL`, `FIELD_ENCRYPTION_KEY`,
etc.) se cargan como variables de entorno marcadas `sync: false` en `render.yaml` y se setean **a
mano** en el dashboard de Render. Eso funciona pero (a) no hay rotación centralizada, (b) los
secretos viven en el dashboard sin auditoría, (c) cada entorno se configura por separado.

**Doppler** centraliza los secretos y los inyecta como variables de entorno en runtime, sin que
vivan en el repo ni en el dashboard. **No requiere cambios de código** — la app sigue leyendo
`process.env.*`.

## Integración (una vez)

1. Crear un proyecto en Doppler (p.ej. `coda`) con configs por entorno: `dev`, `stg`, `prd`.
2. Cargar los secretos actuales en la config `prd` (los mismos nombres que usa la app:
   `JWT_SECRET`, `DATABASE_URL`, `FIELD_ENCRYPTION_KEY`, `REDIS_URL`, `ANTHROPIC_API_KEY`,
   `BLOB_*`, `SENTRY_DSN`, `OPS_WEBHOOK_URL`, `AI_AUTHORIZED_PROVIDERS`, …).
3. En Render, integrar Doppler de una de estas formas:
   - **Render ↔ Doppler sync nativo** (recomendado): conecta el servicio de Render a la config de
     Doppler; Doppler empuja los secretos como env vars del servicio.
   - **Doppler CLI en el `startCommand`**: anteponer `doppler run --` al comando de arranque
     (requiere `DOPPLER_TOKEN` —un service token de solo lectura— como única env var en Render):
     ```yaml
     startCommand: doppler run -- node dist/index.js
     ```

## Después de integrar

Una vez que Doppler inyecta los secretos, **quitar de `render.yaml` las entradas `sync: false`**
que ahora provee Doppler (dejar solo las no-secretas o las gestionadas por Render como
`DATABASE_URL` de su Postgres). Así el blueprint deja de declarar placeholders de secretos.

> Verificación: tras el cambio, el servicio arranca y `GET /health` responde OK; las claves
> sensibles ya no aparecen listadas en la pestaña *Environment* del servicio en Render (las provee
> Doppler en runtime).

## Rotación

Rotar un secreto = cambiarlo en Doppler y redeployar (o re-sync). No hay que tocar el repo ni el
dashboard de Render por secreto.
