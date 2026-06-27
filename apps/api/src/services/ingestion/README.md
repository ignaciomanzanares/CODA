# Ingesta unificada (`OBProvider`) — #18

Todo origen de datos bancarios entra al sistema por **un solo punto**:
`ingestFromProvider(userId, provider)`. El proveedor implementa la interfaz `OBProvider`
(`connectors/openbanking/mockProvider.ts`):

```ts
interface OBProvider {
  listAccounts(userId: string): Promise<OBAccount[]>;
  getBalance(providerAccountId: string): Promise<OBBalance>;
  listTransactions(providerAccountId: string, from: Date, to: Date): Promise<OBTransaction[]>;
}
```

`ingestFromProvider` escribe en las tablas canónicas `accounts` / `balances` / `transactions`.
El resto del sistema (features ML en `ml/features.ts`, listados, scoring) lee **siempre** de esas
tablas y no sabe de dónde vinieron los datos.

## Proveedores

- **`CartolaUploadProvider`** (`cartolaUploadProvider.ts`): envuelve la salida de OCR+parser de
  una cartola (`CartolaExtraida`). Lo invoca `documentUploadService` tras parsear una cartola.
- **`MockProvider`** (`connectors/openbanking/mockProvider.ts`): datos de ejemplo para dev.
- **Futuro** (Khipu, SFA, open banking real): basta implementar `OBProvider` y llamar
  `ingestFromProvider`. **Cero cambios aguas abajo** — ese es el punto de la abstracción.

## Garantías

- **Idempotente**: cuentas deduplicadas por `(userId, providerAccountId)`, transacciones por
  `externalId` dentro de la cuenta. Re-ingestar el mismo origen no duplica filas.
- **Best-effort en balances**: un fallo al traer el balance no aborta la ingesta de
  transacciones.
- **Desacople verificado**: `__tests__/ingestFromProvider.test.ts` usa un `FakeProvider` para
  probar que la ingesta deja `accounts`/`transactions` correctas sin pasar por PDF/OCR —
  demuestra que el flujo no está atado a la cartola.

## Cómo agregar un proveedor nuevo

1. Implementa `OBProvider` (mapea tus cuentas/saldos/movimientos a `OBAccount`/`OBBalance`/`OBTransaction`).
2. Asigna un `externalId` **determinístico** a cada transacción (para la dedup).
3. Llama `await ingestFromProvider(userId, new TuProvider(...))`.
