/**
 * Anonimización irreversible al cierre de cuenta (Ley 19.628/21.719).
 *
 * Reemplaza a `storage.deleteUserData()`, que operaba sobre `Map`s en memoria que nunca se
 * pueblan en producción (todo el acceso real pasa por Drizzle/`db`) y nunca borraba la fila real
 * de `users` en Postgres — hoy "eliminar cuenta" no eliminaba el email/nombre del usuario.
 *
 * Todo aquí opera sobre `db` (Postgres en prod, SQLite local), nunca sobre los `Map`s de
 * `storage.ts`.
 *
 * Decisión NCG 502 vs. Ley 19.628/21.719 (ver también services/audit/README.md):
 * `algorithm_prediction_logs` no se borra (NCG 502 exige conservar el rastro de cada decisión
 * algorítmica), pero se desvincula del usuario real y se le quita la PII de entrada — solo queda
 * el snapshot de salida (score, modelo, versión). `consent_grants`/`privacy_consent_events`
 * tampoco se borran (son la prueba legal de consentimiento/revocación); solo se anonimiza
 * `ipAddress`/`userAgent`.
 */

import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import {
  db,
  users,
  bankConnections,
  accounts,
  balances,
  transactions,
  creditScores,
  creditScoreHistory,
  insuranceRisks,
  transactionalScores,
  riskFactors,
  financialGoals,
  goalProgress,
  expenses,
  billSplits,
  billSplitParticipants,
  notifications,
  pushSubscriptions,
  productRecommendations,
  leadTracking,
  productApplications,
  documentUploads,
  scoreDocumentUploads,
  userScores,
  algorithmPredictionLogs,
  consentGrants,
  privacyConsentEvents,
} from '../../db/index.js';
import { logger } from '../../logger.js';

const ANON_PLACEHOLDER = '[anonimizado]';

/**
 * `algorithm_prediction_logs.user_id` tiene FK NOT NULL a `users.id` — no se puede apuntar a un id
 * sintético sin fila real. Para de-vincular sin perder la FK, todas las cuentas anonimizadas
 * comparten esta única fila placeholder: muchos usuarios distintos terminan en el mismo `userId`
 * de log, por lo que ya no se puede saber a cuál de ellos correspondía una decisión puntual.
 */
const ANONYMOUS_PLACEHOLDER_USER_ID = 'anon-placeholder-system-user';

async function ensureAnonymousPlaceholderUser(): Promise<void> {
  await db
    .insert(users)
    .values({
      id: ANONYMOUS_PLACEHOLDER_USER_ID,
      username: ANONYMOUS_PLACEHOLDER_USER_ID,
      email: `${ANONYMOUS_PLACEHOLDER_USER_ID}@anon.coda.local`,
      passwordHash: randomUUID(),
    })
    .onConflictDoNothing();
}

export async function anonymizeUser(userId: string): Promise<void> {
  // Cuentas bancarias del usuario → balances/transacciones cuelgan de accountId, no de userId.
  const userAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId));
  const accountIds = userAccounts.map((a: { id: number }) => a.id);
  if (accountIds.length > 0) {
    await db.delete(balances).where(inArray(balances.accountId, accountIds));
    await db.delete(transactions).where(inArray(transactions.accountId, accountIds));
  }
  await db.delete(accounts).where(eq(accounts.userId, userId));
  await db.delete(bankConnections).where(eq(bankConnections.userId, userId));

  // Bill splits creados por el usuario → borrar también sus participantes.
  const ownedSplits = await db.select({ id: billSplits.id }).from(billSplits).where(eq(billSplits.createdBy, userId));
  const ownedSplitIds = ownedSplits.map((s: { id: number }) => s.id);
  if (ownedSplitIds.length > 0) {
    await db.delete(billSplitParticipants).where(inArray(billSplitParticipants.billSplitId, ownedSplitIds));
  }
  await db.delete(billSplits).where(eq(billSplits.createdBy, userId));
  await db.delete(billSplitParticipants).where(eq(billSplitParticipants.userId, userId));

  await db.delete(creditScores).where(eq(creditScores.userId, userId));
  await db.delete(creditScoreHistory).where(eq(creditScoreHistory.userId, userId));
  await db.delete(insuranceRisks).where(eq(insuranceRisks.userId, userId));
  await db.delete(transactionalScores).where(eq(transactionalScores.userId, userId));
  await db.delete(riskFactors).where(eq(riskFactors.userId, userId));
  await db.delete(goalProgress).where(eq(goalProgress.userId, userId));
  await db.delete(financialGoals).where(eq(financialGoals.userId, userId));
  await db.delete(expenses).where(eq(expenses.userId, userId));
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await db.delete(productRecommendations).where(eq(productRecommendations.userId, userId));
  await db.delete(leadTracking).where(eq(leadTracking.userId, userId));
  await db.delete(productApplications).where(eq(productApplications.userId, userId));
  await db.delete(documentUploads).where(eq(documentUploads.userId, userId));
  await db.delete(scoreDocumentUploads).where(eq(scoreDocumentUploads.userId, userId));
  await db.delete(userScores).where(eq(userScores.userId, userId));

  // Borrado inmediato de los originales (PDF/imagen) cifrados del blob store (#21): no esperar
  // al TTL de retención cuando el usuario cierra la cuenta.
  try {
    const { deleteOriginalsForUser } = await import('../documents/originalStore.js');
    const n = await deleteOriginalsForUser(userId);
    if (n > 0) logger.info({ userId, count: n }, 'Originales del usuario borrados (cierre de cuenta)');
  } catch (e) {
    logger.warn({ err: e, userId }, 'No se pudieron borrar los originales del usuario (continúo con la anonimización)');
  }

  // Trazabilidad NCG 502: se conserva la decisión (modelo/score), se desvincula y se borra la PII de entrada.
  await ensureAnonymousPlaceholderUser();
  await db
    .update(algorithmPredictionLogs)
    .set({
      userId: ANONYMOUS_PLACEHOLDER_USER_ID,
      inputFeatures: ANON_PLACEHOLDER,
      cmfData: null,
      sfaData: null,
      topFactors: null,
    })
    .where(eq(algorithmPredictionLogs.userId, userId));

  // Prueba legal de consentimiento/revocación: se conserva el evento, se anonimiza solo IP/user-agent.
  await db
    .update(consentGrants)
    .set({ authorizationDetails: ANON_PLACEHOLDER })
    .where(eq(consentGrants.userId, userId));
  await db
    .update(privacyConsentEvents)
    .set({ ipAddress: null, userAgent: null })
    .where(eq(privacyConsentEvents.userId, userId));

  // Fila de `users`: sobrescribir PII con tokens irreversibles (no se borra la fila para no
  // romper FKs de algorithm_prediction_logs/consent_grants/privacy_consent_events que sí se conservan).
  const token = randomUUID();
  await db
    .update(users)
    .set({
      username: `deleted_${token}`,
      email: `deleted_${token}@anon.coda.local`,
      passwordHash: randomUUID(),
      firstName: null,
      lastName: null,
      displayName: null,
      profilePicture: null,
      userMetadata: null,
      totpSecret: null,
      backupCodes: null,
      totpEnabled: 0,
      twoFactorEnabled: 0,
    })
    .where(eq(users.id, userId));

  logger.info({ userId }, 'Account anonymized');
}
