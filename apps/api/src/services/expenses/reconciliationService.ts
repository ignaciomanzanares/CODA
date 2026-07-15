/**
 * Automatic Reconciliation Service
 *
 * Detects deposits (abonos) that match pending bill split payments
 * and automatically marks them as paid + notifies the user.
 *
 * Matching criteria:
 * 1. Amount match (exact or within tolerance)
 * 2. Time window (deposit within N days of split creation)
 * 3. Counterparty match (RUT or name similarity)
 *
 * This implements the "Plan de transición" for expense automation
 * while SFA APIs become fully transactional.
 */

import {
  db,
  billSplits,
  billSplitParticipants,
  notifications,
  eq,
  and,
  sql,
  desc,
} from "../../db/index.js";
import { logger } from "../../logger.js";
import type { CartolaMovement } from "./cartolaParser.js";
import type { ParsedNotification } from "./notificationParser.js";

export interface ReconciliationMatch {
  participantId: number;
  billSplitId: number;
  billSplitName: string;
  participantName: string;
  amountOwed: number;
  depositAmount: number;
  matchConfidence: number; // 0-1
  matchReason: string;
  autoReconciled: boolean;
}

export interface ReconciliationResult {
  matches: ReconciliationMatch[];
  totalReconciled: number;
  totalPending: number;
}

const AMOUNT_TOLERANCE_PERCENT = 0.02; // 2% tolerance
const AMOUNT_TOLERANCE_FIXED = 100; // CLP 100 flat tolerance
const RECONCILIATION_WINDOW_DAYS = 30;

/**
 * Check if two amounts match within tolerance
 */
function amountsMatch(expected: number, actual: number): boolean {
  const diff = Math.abs(expected - actual);
  const percentTolerance = expected * AMOUNT_TOLERANCE_PERCENT;
  return diff <= Math.max(percentTolerance, AMOUNT_TOLERANCE_FIXED);
}

/**
 * Simple string similarity (Dice coefficient)
 */
function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Set<string>();
  for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.slice(i, i + 2));

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    if (bigrams1.has(s2.slice(i, i + 2))) intersection++;
  }

  return (2 * intersection) / (s1.length - 1 + s2.length - 1);
}

/**
 * Get all pending bill split participants for a user (as creator)
 */
async function getPendingSplits(userId: string): Promise<
  Array<{
    participantId: number;
    billSplitId: number;
    billSplitName: string;
    participantName: string;
    participantEmail: string | null;
    amountOwed: number;
    createdAt: string;
  }>
> {
  try {
    const results = await db
      .select({
        participantId: billSplitParticipants.id,
        billSplitId: billSplits.id,
        billSplitName: billSplits.name,
        participantName: billSplitParticipants.name,
        participantEmail: billSplitParticipants.email,
        amountOwed: billSplitParticipants.amountOwed,
        createdAt: billSplits.createdAt,
      })
      .from(billSplitParticipants)
      .innerJoin(billSplits, eq(billSplitParticipants.billSplitId, billSplits.id))
      .where(
        and(
          eq(billSplits.createdBy, userId),
          eq(billSplits.status, "active"),
          sql`(${billSplitParticipants.isPaid} = 0 OR ${billSplitParticipants.isPaid} IS NULL)`,
          sql`${billSplitParticipants.userId} != ${userId}`,
        ),
      )
      .orderBy(desc(billSplits.createdAt));

    return results;
  } catch (error) {
    logger.error({ error, userId }, "Failed to get pending splits");
    return [];
  }
}

/**
 * Try to reconcile a single deposit against pending splits
 */
export async function reconcileDeposit(
  userId: string,
  deposit: {
    amount: number;
    description: string;
    date: string;
    counterpartyName?: string;
    counterpartyRut?: string;
  },
): Promise<ReconciliationMatch[]> {
  const pendingSplits = await getPendingSplits(userId);
  if (pendingSplits.length === 0) return [];

  const matches: ReconciliationMatch[] = [];

  for (const split of pendingSplits) {
    let confidence = 0;
    const reasons: string[] = [];

    // 1. Amount match (most important)
    if (amountsMatch(split.amountOwed, deposit.amount)) {
      confidence += 0.6;
      reasons.push("Monto coincide");

      // Exact match gets extra confidence
      if (Math.abs(split.amountOwed - deposit.amount) < 1) {
        confidence += 0.1;
        reasons.push("Monto exacto");
      }
    } else {
      continue; // Skip if amounts don't match at all
    }

    // 2. Name/counterparty match
    if (deposit.counterpartyName && split.participantName) {
      const nameSim = stringSimilarity(deposit.counterpartyName, split.participantName);
      if (nameSim > 0.5) {
        confidence += 0.2 * nameSim;
        reasons.push(`Nombre similar (${Math.round(nameSim * 100)}%)`);
      }
    }

    // 3. Time window check
    const splitDate = new Date(split.createdAt);
    const depositDate = new Date(deposit.date);
    const daysDiff = Math.abs(depositDate.getTime() - splitDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff <= RECONCILIATION_WINDOW_DAYS) {
      confidence += 0.1;
      reasons.push(`Dentro de ${Math.round(daysDiff)} días`);
    }

    // Only include matches with reasonable confidence
    if (confidence >= 0.5) {
      const autoReconciled = confidence >= 0.8;

      matches.push({
        participantId: split.participantId,
        billSplitId: split.billSplitId,
        billSplitName: split.billSplitName,
        participantName: split.participantName,
        amountOwed: split.amountOwed,
        depositAmount: deposit.amount,
        matchConfidence: Math.min(confidence, 1),
        matchReason: reasons.join(", "),
        autoReconciled,
      });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.matchConfidence - a.matchConfidence);

  return matches;
}

/**
 * Auto-reconcile: Mark participant as paid and notify
 */
export async function autoReconcileAndNotify(
  userId: string,
  match: ReconciliationMatch,
): Promise<boolean> {
  try {
    // Mark participant as paid
    await db
      .update(billSplitParticipants)
      .set({
        isPaid: 1,
        amountPaid: match.depositAmount,
      })
      .where(eq(billSplitParticipants.id, match.participantId));

    // Create notification for the creator
    await db.insert(notifications).values({
      userId,
      title: "💰 Pago recibido",
      message: `${match.participantName} pagó $${match.depositAmount.toLocaleString("es-CL")} por "${match.billSplitName}". Conciliación automática (${Math.round(match.matchConfidence * 100)}% confianza).`,
      type: "reconciliation",
      category: "bill_split",
      isRead: 0,
      actionUrl: `/bill-split`,
      metadata: JSON.stringify({
        billSplitId: match.billSplitId,
        participantId: match.participantId,
        matchConfidence: match.matchConfidence,
        matchReason: match.matchReason,
      }),
    });

    logger.info(
      {
        userId,
        billSplitId: match.billSplitId,
        participantId: match.participantId,
        confidence: match.matchConfidence,
      },
      "Auto-reconciliation completed",
    );

    return true;
  } catch (error) {
    logger.error({ error, match }, "Failed to auto-reconcile");
    return false;
  }
}

/**
 * Process cartola movements for reconciliation
 * Called after a cartola PDF is uploaded and parsed
 */
export async function reconcileCartolaMovements(
  userId: string,
  movements: CartolaMovement[],
): Promise<ReconciliationResult> {
  const abonos = movements.filter((m) => m.sfaOperationType === "abono");
  const allMatches: ReconciliationMatch[] = [];
  let totalReconciled = 0;

  for (const abono of abonos) {
    const matches = await reconcileDeposit(userId, {
      amount: abono.amount,
      description: abono.description,
      date: abono.date,
      counterpartyName: abono.merchantName,
    });

    for (const match of matches) {
      allMatches.push(match);

      if (match.autoReconciled) {
        const success = await autoReconcileAndNotify(userId, match);
        if (success) totalReconciled++;
      }
    }
  }

  const pendingSplits = await getPendingSplits(userId);

  return {
    matches: allMatches,
    totalReconciled,
    totalPending: pendingSplits.length - totalReconciled,
  };
}

/**
 * Process a parsed notification for reconciliation
 * Called when a push notification is parsed
 */
export async function reconcileNotification(
  userId: string,
  notification: ParsedNotification,
): Promise<ReconciliationMatch[]> {
  if (notification.operationType !== "abono") return [];

  return reconcileDeposit(userId, {
    amount: notification.amount,
    description: notification.rawText,
    date: notification.date,
    counterpartyName: notification.merchant,
  });
}
