import { logger } from "../../logger.js";
import { storage } from "../../storage.js";
import { deleteTransactionsForDocument } from "./normalizeCartola.js";

interface DocumentUploadLike {
  id: string;
  banco?: string | null;
  periodoDesde?: string | null;
  periodoHasta?: string | null;
}

interface ScoreDocumentUploadLike {
  id: string;
  sourceDocumentUploadId?: string | null;
  banco?: string | null;
  periodoDesde?: string | null;
  periodoHasta?: string | null;
}

interface RelatedScoreDocsResult {
  docs: ScoreDocumentUploadLike[];
  via: "source_document_upload_id" | "legacy_unique_match" | "none" | "legacy_ambiguous";
  legacyCandidateCount: number;
}

function sameCartolaPeriod(doc: DocumentUploadLike, scoreDoc: ScoreDocumentUploadLike): boolean {
  return (
    scoreDoc.banco === doc.banco &&
    scoreDoc.periodoDesde === doc.periodoDesde &&
    scoreDoc.periodoHasta === doc.periodoHasta
  );
}

export function findRelatedScoreDocsForDocumentUpload(
  doc: DocumentUploadLike,
  scoreDocs: ScoreDocumentUploadLike[],
): RelatedScoreDocsResult {
  const explicit = scoreDocs.filter((scoreDoc) => scoreDoc.sourceDocumentUploadId === doc.id);
  if (explicit.length > 0) {
    return { docs: explicit, via: "source_document_upload_id", legacyCandidateCount: 0 };
  }

  const legacyCandidates = scoreDocs.filter(
    (scoreDoc) => !scoreDoc.sourceDocumentUploadId && sameCartolaPeriod(doc, scoreDoc),
  );
  if (legacyCandidates.length === 1) {
    return { docs: legacyCandidates, via: "legacy_unique_match", legacyCandidateCount: 1 };
  }
  if (legacyCandidates.length > 1) {
    return { docs: [], via: "legacy_ambiguous", legacyCandidateCount: legacyCandidates.length };
  }
  return { docs: [], via: "none", legacyCandidateCount: 0 };
}

export async function deleteRelatedScoreDocsForDocumentUpload(
  userId: string,
  doc: DocumentUploadLike,
): Promise<{
  removedTransactions: number;
  removedScoreDocuments: number;
  via: RelatedScoreDocsResult["via"];
  legacyCandidateCount: number;
}> {
  const scoreDocs = (await storage.listScoreDocumentUploadsByType(
    userId,
    "cartola",
  )) as ScoreDocumentUploadLike[];
  const related = findRelatedScoreDocsForDocumentUpload(doc, scoreDocs);

  if (related.via === "legacy_ambiguous") {
    logger.warn(
      { userId, documentUploadId: doc.id, candidateCount: related.legacyCandidateCount },
      "document_upload delete skipped ambiguous legacy score_document_upload match",
    );
  }

  let removedTransactions = 0;
  let removedScoreDocuments = 0;
  for (const scoreDoc of related.docs) {
    removedTransactions += await deleteTransactionsForDocument(userId, scoreDoc.id).catch(() => 0);
    const deleted = await storage
      .deleteScoreDocumentUploadById(scoreDoc.id, userId)
      .catch(() => false);
    if (deleted) removedScoreDocuments += 1;
  }

  return {
    removedTransactions,
    removedScoreDocuments,
    via: related.via,
    legacyCandidateCount: related.legacyCandidateCount,
  };
}
