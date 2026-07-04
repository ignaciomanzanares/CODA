import { describe, expect, it } from "vitest";
import { getCreditScoreAvailability } from "../../src/services/creditScoreAvailability.js";

function storageMock(overrides: {
  creditScore?: any;
  documentUploads?: any[];
  scoreDocumentUploads?: any[];
}) {
  return {
    getCreditScore: async () => overrides.creditScore,
    listDocumentUploadsByType: async (_userId: string, tipo: string) =>
      tipo === "cmf" ? (overrides.documentUploads ?? []) : [],
    listScoreDocumentUploadsByType: async (_userId: string, tipo: string) =>
      tipo === "cmf" ? (overrides.scoreDocumentUploads ?? []) : [],
  };
}

describe("getCreditScoreAvailability", () => {
  it("does not expose a numeric credit score when the user has no CMF report", async () => {
    const result = await getCreditScoreAvailability("user-1", storageMock({}));

    expect(result).toMatchObject({
      available: false,
      reason: "missing_cmf_report",
      score: null,
    });
  });

  it("does not treat cartola uploads as a credit score source", async () => {
    const result = await getCreditScoreAvailability("user-1", storageMock({
      documentUploads: [{ id: "doc-cartola", tipo: "cartola", parseStatus: "success" }],
      scoreDocumentUploads: [{ id: "score-cartola", tipo: "cartola", parseStatus: "success" }],
      creditScore: {
        score: 768,
        maxScore: 850,
        paymentHistory: "Excellent",
        utilization: "Good",
        ageOfCredit: "Good",
      },
    }));

    expect(result.available).toBe(false);
    expect(result.reason).toBe("missing_cmf_report");
    expect(result.score).toBeNull();
  });

  it("returns pending when a CMF report exists but no credit score row has been persisted", async () => {
    const result = await getCreditScoreAvailability("user-1", storageMock({
      documentUploads: [{ id: "cmf-doc", tipo: "cmf", parseStatus: "success", uploadedAt: "2026-06-20T10:00:00.000Z" }],
    }));

    expect(result.available).toBe(false);
    expect(result.reason).toBe("cmf_score_pending");
    expect(result.score).toBeNull();
  });

  it("returns the credit score only when a successful CMF report exists", async () => {
    const result = await getCreditScoreAvailability("user-1", storageMock({
      documentUploads: [{ id: "cmf-doc", tipo: "cmf", parseStatus: "success", uploadedAt: "2026-06-20T10:00:00.000Z" }],
      creditScore: {
        score: 768,
        maxScore: 850,
        paymentHistory: "Excellent",
        utilization: "Good",
        ageOfCredit: "Good",
        lastUpdated: "2026-06-20T10:01:00.000Z",
      },
    }));

    expect(result).toMatchObject({
      available: true,
      score: 768,
      maxScore: 850,
      source: {
        type: "cmf",
        label: "Informe de Deudas CMF",
        documentId: "cmf-doc",
      },
    });
  });
});
