/**
 * Punto ÚNICO de ingesta de cuentas/transacciones (#18).
 *
 * Todo origen de datos bancarios —cartola subida hoy, y mañana Khipu/SFA/open banking— se
 * adapta a la interfaz `OBProvider` y se ingesta por aquí. El resto del sistema (features ML,
 * listados, scoring) lee siempre de las tablas `accounts`/`transactions`/`balances`, sin saber
 * de dónde vinieron los datos. Agregar un proveedor nuevo = implementar `OBProvider`, cero
 * cambios aguas abajo.
 *
 * Idempotente: las cuentas se deduplican por `(userId, providerAccountId)` y las transacciones
 * por `externalId` dentro de la cuenta, así que re-ingestar el mismo origen no duplica filas.
 */
import { storage } from '../../storage.js';
import type { OBProvider } from '../../connectors/openbanking/mockProvider.js';
import { mlLogger as logger } from '../../logger.js';

export interface IngestSummary {
  accountsCreated: number;
  accountsMatched: number;
  balancesWritten: number;
  transactionsInserted: number;
  transactionsSkipped: number;
}

export async function ingestFromProvider(
  userId: string,
  provider: OBProvider,
  opts?: { from?: Date; to?: Date },
): Promise<IngestSummary> {
  const from = opts?.from ?? new Date(0);
  const to = opts?.to ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const summary: IngestSummary = {
    accountsCreated: 0,
    accountsMatched: 0,
    balancesWritten: 0,
    transactionsInserted: 0,
    transactionsSkipped: 0,
  };

  const obAccounts = await provider.listAccounts(userId);
  const existingAccounts = await storage.getAccounts(userId);

  for (const ob of obAccounts) {
    let account = existingAccounts.find((a) => a.providerAccountId === ob.providerAccountId);
    if (!account) {
      account = await storage.createAccount({
        userId,
        providerAccountId: ob.providerAccountId,
        name: ob.name ?? null,
        officialName: ob.officialName ?? null,
        type: ob.type ?? null,
        subtype: ob.subtype ?? null,
        currency: ob.currency ?? null,
        mask: ob.mask ?? null,
        openedAt: ob.openedAt ? ob.openedAt.toISOString() : null,
      } as Parameters<typeof storage.createAccount>[0]);
      existingAccounts.push(account);
      summary.accountsCreated += 1;
    } else {
      summary.accountsMatched += 1;
    }

    // Balance (mejor esfuerzo; un fallo de balance no debe abortar la ingesta de transacciones).
    try {
      const bal = await provider.getBalance(ob.providerAccountId);
      if (bal && Number.isFinite(bal.current)) {
        await storage.upsertBalance({
          accountId: account.id,
          current: bal.current,
          available: bal.available ?? null,
          creditLimit: bal.creditLimit ?? null,
          currency: bal.currency ?? ob.currency ?? null,
        } as Parameters<typeof storage.upsertBalance>[0]);
        summary.balancesWritten += 1;
      }
    } catch (e) {
      logger.warn({ err: e, providerAccountId: ob.providerAccountId }, 'ingestFromProvider: getBalance falló (no fatal)');
    }

    // Transacciones, deduplicadas por externalId.
    const obTxs = await provider.listTransactions(ob.providerAccountId, from, to);
    const existingTxs = await storage.getTransactions(account.id);
    const seen = new Set<string>(
      existingTxs.map((t) => t.externalId).filter((x): x is string => !!x),
    );

    const toInsert: Parameters<typeof storage.createTransactionsBulk>[0] = [];
    for (const t of obTxs) {
      if (t.externalId && seen.has(t.externalId)) {
        summary.transactionsSkipped += 1;
        continue;
      }
      toInsert.push({
        accountId: account.id,
        externalId: t.externalId ?? null,
        postedAt: t.postedAt.toISOString(),
        description: t.description ?? null,
        merchantName: t.merchantName ?? null,
        amount: t.amount,
        currency: t.currency ?? null,
        category: t.category ?? null,
        subcategory: t.subcategory ?? null,
        pending: t.pending ? 1 : 0,
        raw: t.raw != null ? JSON.stringify(t.raw) : null,
      } as (typeof toInsert)[number]);
      if (t.externalId) seen.add(t.externalId);
    }

    if (toInsert.length > 0) {
      await storage.createTransactionsBulk(toInsert);
      summary.transactionsInserted += toInsert.length;
    }
  }

  return summary;
}
