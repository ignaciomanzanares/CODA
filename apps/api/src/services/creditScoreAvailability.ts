const CREDIT_SCORE_MAX = 850;

export type CreditScoreUnavailableReason = "missing_cmf_report" | "cmf_score_pending";

export interface CreditScoreSource {
  type: "cmf";
  label: "Informe de Deudas CMF";
  documentId: string | null;
  uploadedAt: string | null;
}

export interface CreditScoreAvailableResponse {
  available: true;
  reason: null;
  score: number;
  maxScore: number;
  paymentHistory: string;
  utilization: string;
  ageOfCredit: string;
  lastUpdated: string | null;
  source: CreditScoreSource;
}

export interface CreditScoreUnavailableResponse {
  available: false;
  reason: CreditScoreUnavailableReason;
  score: null;
  maxScore: number;
  paymentHistory: "";
  utilization: "";
  ageOfCredit: "";
  lastUpdated: null;
  source: null;
  message: string;
}

export type CreditScoreResponse = CreditScoreAvailableResponse | CreditScoreUnavailableResponse;

interface CreditScoreStorage {
  getCreditScore(userId: string): Promise<any>;
  listDocumentUploadsByType(userId: string, tipo: string): Promise<any[]>;
  listScoreDocumentUploadsByType(userId: string, tipo: string): Promise<any[]>;
}

function unavailable(reason: CreditScoreUnavailableReason): CreditScoreUnavailableResponse {
  const message = reason === "missing_cmf_report"
    ? "Sube tu Informe de Deudas CMF para calcular tu score crediticio."
    : "Tu Informe de Deudas CMF está cargado, pero el score crediticio aún no está disponible.";
  return {
    available: false,
    reason,
    score: null,
    maxScore: CREDIT_SCORE_MAX,
    paymentHistory: "",
    utilization: "",
    ageOfCredit: "",
    lastUpdated: null,
    source: null,
    message,
  };
}

function isSuccessfulCmfUpload(doc: any): boolean {
  return doc?.tipo === "cmf" && (doc.parseStatus == null || doc.parseStatus === "success");
}

function newestUpload(docs: any[]): any | null {
  const successful = docs.filter(isSuccessfulCmfUpload);
  if (successful.length === 0) return null;
  return successful.sort((a, b) => String(b.uploadedAt ?? "").localeCompare(String(a.uploadedAt ?? "")))[0];
}

export async function getCreditScoreAvailability(
  userId: string,
  storage: CreditScoreStorage,
): Promise<CreditScoreResponse> {
  const [documentUploads, scoreDocumentUploads] = await Promise.all([
    storage.listDocumentUploadsByType(userId, "cmf"),
    storage.listScoreDocumentUploadsByType(userId, "cmf"),
  ]);
  const cmfSource = newestUpload([...documentUploads, ...scoreDocumentUploads]);

  if (!cmfSource) {
    return unavailable("missing_cmf_report");
  }

  const existing = await storage.getCreditScore(userId);
  if (!existing || typeof existing.score !== "number") {
    return unavailable("cmf_score_pending");
  }

  return {
    available: true,
    reason: null,
    score: existing.score,
    maxScore: existing.maxScore ?? CREDIT_SCORE_MAX,
    paymentHistory: existing.paymentHistory ?? "Unknown",
    utilization: existing.utilization ?? "Unknown",
    ageOfCredit: existing.ageOfCredit ?? "Unknown",
    lastUpdated: existing.lastUpdated ?? null,
    source: {
      type: "cmf",
      label: "Informe de Deudas CMF",
      documentId: cmfSource.id ?? null,
      uploadedAt: cmfSource.uploadedAt ?? existing.lastUpdated ?? null,
    },
  };
}
