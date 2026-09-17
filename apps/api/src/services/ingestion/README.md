# Capa de ingesta común (D1)

Cómo entran los datos de un titular a CODA y qué garantías tiene cada consulta a una fuente.
Esta carpeta es sólo el mapa: el código vive donde se indica.

```
pedido (usuario o tarea programada)
  │
  ├─ conector sin el usuario presente (CMF, SII, AFC…)
  │    requestConnectorRun ── con REDIS_URL → cola `connector-run` → worker
  │                        └─ sin REDIS_URL → en el proceso, con reintentos
  │
  └─ scraper bancario (clave + MFA, usuario presente) → scrapeAndIngest, en el request
                     │
                     ▼
        withSourceAccess  ← gate de consentimiento (D2) + traza por consulta
                     │
                     ▼
        tablas normalizadas (accounts / balances / transactions, user_financial_sources…)
                     │
                     ▼
        perfil canónico con procedencia por dato  →  GET /api/profile/canonical
```

## Piezas

| Pieza | Dónde |
|---|---|
| Contrato canónico (identidad/renta/deuda/empleo + procedencia) | `services/canonical/` |
| Gate de consentimiento + traza por consulta | `services/audit/sourceAccessAudit.ts` (`withSourceAccess`) |
| Registro de conectores | `connectors/registry.ts` |
| Ejecución: cola o en proceso | `connectors/runConnector.ts`, `queues/connectorQueue.ts`, `workers/connectorWorker.ts` |
| Conectores de fuentes oficiales | `connectors/sources/` (hoy: `sii-carpeta`) |
| Ingesta bancaria a tablas normalizadas | `jobs/ingest.ts` (`ingestOpenBankingForUser`) |
| Cartolas subidas (PDF) | `normalizeCartolaDoc` — único escritor de sus transacciones |
| Bóveda de secretos delegados (código/clave de la carpeta SII) | `services/secrets/connectorSecretVault.ts` |
| Cifrado en reposo + rotación de llaves | `services/crypto/` |

## Garantías de cada consulta a una fuente

- **Sin consentimiento vigente no se consulta.** `withSourceAccess` busca el grant que cubre el
  recurso (`cmf_debt_report`, `sii_tax_data`, `afc_employment`, `account_information`…) y si no
  hay, lanza `ConsentRequiredError` sin ejecutar el conector. El rechazo queda registrado.
- **Y por INSTITUCIÓN (B3).** Si el conector nombra la institución (`institution` en el contexto,
  p. ej. el bankId del scraper), sólo sirve un grant de ESE banco (`ipiId`). Un consentimiento sin
  banco no es permiso abierto a cualquier banco. El titular exporta su expediente completo
  (hechos + sello + verificación) en `GET /api/consent/export`.
- **Sin traza no se consulta.** La fila `source_access.started` se escribe en `audit_logs` antes de
  tocar la fuente; si no se puede escribir, la consulta no ocurre. El término (`succeeded` /
  `failed`) va en otra fila con el mismo `entity_id` (append-only).
- **Sin PII en la traza.** Ids, conector, quién la pidió, duración y código de error. Nunca el
  mensaje del error.
- **Credenciales fuera de la cola.** El job lleva sólo `userId`, `connectorId` y `trigger`. El
  scraper recibe la clave en memoria y cierra el navegador en un `finally`. Si un conector necesita
  un secreto que el usuario delega (el código + clave de su carpeta tributaria), lo lee de la
  bóveda con `getSecret(userId, connectorId)`: cifrado en reposo, con vencimiento obligatorio y
  borrado por el job de retención. Nunca viaja en el job ni sale por la API.
- **Una fuente que falla seguido avisa.** Tres fallos consecutivos de un conector alertan a Ops
  (correo o webhook, ver `docs/INTEGRATION_GUIDE.md`).
- El titular ve sus consultas en `GET /api/data-sources/access-log`.

## Agregar un conector de fuente

```ts
registerConnector({
  id: "cmf-informe-deudas",
  resourceType: "cmf_debt_report",
  async run({ userId, accessId, consentGrantId }) {
    // traer + normalizar + persistir; devolver un resumen chico (va a Redis)
    return { deudas: 3 };
  },
  isRetryable: (err) => !(err instanceof CredencialInvalidaError),
});

await requestConnectorRun(userId, "cmf-informe-deudas");
```

No llames a `assertSourceConsent` desde el conector: el runner ya pasa por `withSourceAccess`.

## Carpeta Tributaria del SII (D5, obtención)

La vía para traer renta declarada sin pedir la ClaveÚnica: el titular genera la carpeta en sii.cl
y delega un CÓDIGO + CLAVE acotados y revocables.

| Endpoint | Qué hace |
|---|---|
| `POST /api/data-sources/sii-carpeta/secreto` | Guarda código+clave en la bóveda (cifrados). No vuelven a salir |
| `GET /api/data-sources/sii-carpeta/secreto` | Si hay acceso, cuándo vence y cuándo se usó — nunca el secreto |
| `DELETE /api/data-sources/sii-carpeta/secreto` | El titular revoca el acceso |
| `POST /api/data-sources/sii-carpeta/consultar` | Dispara la consulta (cola o en proceso), con gate + traza |

Consultar responde hoy **501**: falta implementar el fetch contra el sitio del SII (runbook en
`connectors/sources/siiCarpeta.ts`). El parseo ya existe y el camino de subir el PDF a mano
(`POST /api/data-sources/sii`) sigue funcionando.

## Cola en producción

Hoy `REDIS_URL` no está en `coda-api`: los conectores y los uploads corren en el proceso. Para
encender la cola sin pagar un worker aparte: Redis (Render Key Value, política `noeviction`) +
`REDIS_URL` + `RUN_WORKERS_IN_PROCESS=true` en la API. Los jobs de documentos llevan la key del
original cifrado, no el PDF, así que caben en un Redis chico. En ese modo el worker de documentos
procesa de a uno (`DOCUMENT_WORKER_CONCURRENCY` lo cambia) para no competir por memoria con la API.
