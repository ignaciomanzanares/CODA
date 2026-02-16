/**
 * Reconciliation Match Engine
 * 
 * Matches bank transactions to DTE documents (invoices).
 * Uses fuzzy matching based on amount, date, and counterparty.
 * 
 * MATCHING ALGORITHM:
 * 1. Exact amount match: +40 points
 * 2. Date proximity (within 7 days): +30 points
 * 3. Counterparty RUT match: +30 points
 * 4. Fuzzy amount (within 5%): +20 points
 * 
 * ASSUMPTIONS:
 * - Bank credits match issued invoices (revenue)
 * - Bank debits match received invoices (expenses)
 * - Tolerance: 5% for fuzzy amount matching
 */

import type { ReconciliationMatch, ReconciliationResult } from '../types.js';
import { scoreMatch, MatchCandidate } from './scoring.js';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface BankTransactionForMatch {
  id: number;
  amount: number;
  transactionDate: string;
  counterpartyName?: string;
  counterpartyRut?: string;
  reference?: string;
}

export interface DTEDocumentForMatch {
  id: number;
  totalAmount: number;
  issueDate: string;
  direction: 'issued' | 'received';
  emitterRut: string;
  receiverRut: string;
  emitterName: string;
  receiverName: string;
  folio: number;
}

// =============================================================================
// MATCH ENGINE
// =============================================================================

/**
 * Run reconciliation between bank transactions and DTE documents
 */
export function reconcile(
  transactions: BankTransactionForMatch[],
  documents: DTEDocumentForMatch[],
  options: {
    minScore?: number;
    maxDateDiff?: number;
    amountTolerance?: number;
  } = {}
): ReconciliationResult {
  const {
    minScore = 60,
    maxDateDiff = 7,
    amountTolerance = 0.05,
  } = options;

  const matches: ReconciliationMatch[] = [];
  const matchedTxnIds = new Set<number>();
  const matchedDocIds = new Set<number>();

  // For each transaction, find best matching document
  for (const txn of transactions) {
    // Filter documents by direction
    // Bank credit (positive) -> issued invoice (we received payment)
    // Bank debit (negative) -> received invoice (we paid)
    const candidateDocs = documents.filter(doc => {
      if (txn.amount > 0 && doc.direction === 'issued') return true;
      if (txn.amount < 0 && doc.direction === 'received') return true;
      return false;
    });

    let bestMatch: ReconciliationMatch | null = null;
    let bestScore = 0;

    for (const doc of candidateDocs) {
      // Skip already matched documents
      if (matchedDocIds.has(doc.id)) continue;

      const candidate: MatchCandidate = {
        bankAmount: Math.abs(txn.amount),
        docAmount: doc.totalAmount,
        bankDate: txn.transactionDate,
        docDate: doc.issueDate,
        bankCounterpartyRut: txn.counterpartyRut,
        docCounterpartyRut: txn.amount > 0 ? doc.receiverRut : doc.emitterRut,
        bankReference: txn.reference,
        docFolio: doc.folio.toString(),
      };

      const result = scoreMatch(candidate, { maxDateDiff, amountTolerance });

      if (result.score > bestScore && result.score >= minScore) {
        bestScore = result.score;
        bestMatch = {
          bankTransactionId: txn.id,
          dteDocumentId: doc.id,
          score: result.score,
          matchType: result.score >= 90 ? 'exact' : 'fuzzy',
          matchedFields: result.matchedFields,
          amountDifference: Math.abs(txn.amount) - doc.totalAmount,
          status: 'proposed',
        };
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
      matchedTxnIds.add(txn.id);
      matchedDocIds.add(bestMatch.dteDocumentId);
    }
  }

  // Calculate unmatched items
  const unmatchedTransactions = transactions
    .filter(t => !matchedTxnIds.has(t.id))
    .map(t => t.id);

  const unmatchedDocuments = documents
    .filter(d => !matchedDocIds.has(d.id))
    .map(d => d.id);

  const matchRate = transactions.length > 0
    ? (matches.length / transactions.length) * 100
    : 0;

  return {
    totalTransactions: transactions.length,
    matchedCount: matches.length,
    unmatchedCount: unmatchedTransactions.length,
    matches,
    unmatchedTransactions,
    unmatchedDocuments,
    matchRate: Math.round(matchRate * 10) / 10,
  };
}

/**
 * Confirm a proposed match
 */
export function confirmMatch(
  match: ReconciliationMatch
): ReconciliationMatch {
  return {
    ...match,
    status: 'confirmed',
  };
}

/**
 * Reject a proposed match
 */
export function rejectMatch(
  match: ReconciliationMatch
): ReconciliationMatch {
  return {
    ...match,
    status: 'rejected',
  };
}
