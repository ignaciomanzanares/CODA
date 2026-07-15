/**
 * Reconciliation Scoring
 *
 * Calculates match scores between bank transactions and DTE documents.
 * Pure functions for testability.
 *
 * SCORING BREAKDOWN:
 * - Amount exact match: 40 points
 * - Amount fuzzy match (within tolerance): 20 points
 * - Date exact match: 30 points
 * - Date proximity (within N days): 15-25 points
 * - RUT match: 30 points
 * - Reference/Folio match: 10 points (bonus)
 *
 * MAX SCORE: 100 (without bonus)
 */

export interface MatchCandidate {
  bankAmount: number;
  docAmount: number;
  bankDate: string;
  docDate: string;
  bankCounterpartyRut?: string;
  docCounterpartyRut?: string;
  bankReference?: string;
  docFolio?: string;
}

export interface ScoringOptions {
  maxDateDiff?: number;
  amountTolerance?: number;
}

export interface MatchScore {
  score: number;
  matchedFields: string[];
  breakdown: {
    amount: number;
    date: number;
    counterparty: number;
    reference: number;
  };
}

/**
 * Calculate match score between a bank transaction and a DTE document
 */
export function scoreMatch(candidate: MatchCandidate, options: ScoringOptions = {}): MatchScore {
  const { maxDateDiff = 7, amountTolerance = 0.05 } = options;

  const matchedFields: string[] = [];
  let amountScore = 0;
  let dateScore = 0;
  let counterpartyScore = 0;
  let referenceScore = 0;

  // Amount matching (0-40 points)
  amountScore = scoreAmount(candidate.bankAmount, candidate.docAmount, amountTolerance);
  if (amountScore > 0) matchedFields.push("amount");

  // Date matching (0-30 points)
  dateScore = scoreDate(candidate.bankDate, candidate.docDate, maxDateDiff);
  if (dateScore > 0) matchedFields.push("date");

  // Counterparty RUT matching (0-30 points)
  if (candidate.bankCounterpartyRut && candidate.docCounterpartyRut) {
    counterpartyScore = scoreRut(candidate.bankCounterpartyRut, candidate.docCounterpartyRut);
    if (counterpartyScore > 0) matchedFields.push("counterparty");
  }

  // Reference/Folio matching (0-10 bonus points)
  if (candidate.bankReference && candidate.docFolio) {
    referenceScore = scoreReference(candidate.bankReference, candidate.docFolio);
    if (referenceScore > 0) matchedFields.push("reference");
  }

  // Cap at 100
  const totalScore = Math.min(100, amountScore + dateScore + counterpartyScore + referenceScore);

  return {
    score: totalScore,
    matchedFields,
    breakdown: {
      amount: amountScore,
      date: dateScore,
      counterparty: counterpartyScore,
      reference: referenceScore,
    },
  };
}

/**
 * Score amount match
 */
export function scoreAmount(bankAmount: number, docAmount: number, tolerance: number): number {
  if (bankAmount === docAmount) {
    return 40; // Exact match
  }

  const diff = Math.abs(bankAmount - docAmount);
  const percentDiff = diff / Math.max(bankAmount, docAmount, 1);

  if (percentDiff <= tolerance) {
    return 20; // Within tolerance
  }

  return 0;
}

/**
 * Score date proximity
 */
export function scoreDate(bankDate: string, docDate: string, maxDays: number): number {
  const bank = new Date(bankDate);
  const doc = new Date(docDate);
  const diffMs = Math.abs(bank.getTime() - doc.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays === 0) {
    return 30; // Same day
  }

  if (diffDays <= 3) {
    return 25; // Within 3 days
  }

  if (diffDays <= maxDays) {
    return 15; // Within max days
  }

  return 0;
}

/**
 * Score RUT match (Chilean tax ID)
 */
export function scoreRut(rut1: string, rut2: string): number {
  // Normalize RUTs (remove dots and dashes)
  const normalize = (rut: string) => rut.replace(/[.-]/g, "").toUpperCase();

  if (normalize(rut1) === normalize(rut2)) {
    return 30;
  }

  return 0;
}

/**
 * Score reference/folio match (bonus)
 */
export function scoreReference(reference: string, folio: string): number {
  // Check if reference contains the folio number
  if (reference.includes(folio)) {
    return 10;
  }

  return 0;
}
