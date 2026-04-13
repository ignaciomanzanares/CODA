/**
 * Rutas: parse cartola/CMF PDF y cálculo de scores (document_uploads + user_scores).
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { storage } from "./storage.js";
import { parseCartolaPdfBuffer, type CartolaParseResult } from "./parsers/cartola-parser.js";
import { parseCmfPdfBuffer, type CMFParseResult } from "./parsers/cmf-parser.js";
import { calculateTransactionalScore, type TransactionalScoreResult } from "./scoring/transactional-score.js";
import {
  calculateCreditScore,
  calculateCreditScoreCmfOnly,
  conservativeCmfPlaceholder,
  type CreditScoreResult,
} from "./scoring/credit-score.js";
import { logger } from "./logger.js";

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).user?.userId || "";
}

function recomendacionesFromScores(
  credit: { score: number } | null,
  transactional: { score: number } | null
): string[] {
  const out: string[] = [];
  if (transactional !== null && transactional.score < 50) {
    out.push("Mantén un colchón de liquidez para reducir días con saldo bajo la línea crítica.");
  }
  if (credit !== null && credit.score < 700) {
    out.push("Revisa el peso de tus deudas frente a tus ingresos y prioriza moras de mayor antigüedad.");
  }
  if (out.length === 0) {
    out.push("Continúa monitoreando tus cargos recurrentes y el timing de tus ingresos.");
  }
  return out.slice(0, 5);
}

export function registerDocumentParsingAndScoringRoutes(app: Express): void {
  app.post(
    "/api/documents/parse-cartola",
    authenticate,
    (req, res, next) => {
      uploadPdf.single("file")(req, res, (err: unknown) => {
        if (err) {
          return res.status(400).json({ message: "No se pudo leer el archivo." });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file?.buffer) {
          return res.status(400).json({ message: "Adjunta un PDF en el campo 'file'." });
        }
        const parsed = await parseCartolaPdfBuffer(file.buffer);
        const id = randomUUID();

        // Convert Date objects to ISO strings for consistent storage
        const parsedDataForStorage = {
          ...parsed,
          periodo: {
            desde: parsed.periodo.desde.toISOString(),
            hasta: parsed.periodo.hasta.toISOString(),
            dias: parsed.periodo.dias,
          },
          transacciones: parsed.transacciones.map(tx => ({
            ...tx,
            fecha: tx.fecha instanceof Date ? tx.fecha.toISOString().slice(0, 10) : tx.fecha,
          })),
        };

        await storage.createDocumentUpload({
          id,
          userId,
          tipo: "cartola",
          banco: parsed.banco,
          periodoDesde: parsed.periodo.desde.toISOString().slice(0, 10),
          periodoHasta: parsed.periodo.hasta.toISOString().slice(0, 10),
          parsedData: parsedDataForStorage,
          parseStatus: "success",
        });
        res.json({ ...parsed, document_id: id });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al parsear cartola";
        logger.error({ err: e }, "parse-cartola");
        res.status(400).json({ message: msg });
      }
    }
  );

  app.post(
    "/api/documents/parse-cmf",
    authenticate,
    (req, res, next) => {
      uploadPdf.single("file")(req, res, (err: unknown) => {
        if (err) {
          return res.status(400).json({ message: "No se pudo leer el archivo." });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = getUserId(req);
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file?.buffer) {
          return res.status(400).json({ message: "Adjunta un PDF en el campo 'file'." });
        }
        const parsed = await parseCmfPdfBuffer(file.buffer);
        const id = randomUUID();
        await storage.createDocumentUpload({
          id,
          userId,
          tipo: "cmf",
          banco: null,
          periodoDesde: null,
          periodoHasta: null,
          parsedData: parsed,
          parseStatus: "success",
        });
        res.json({ ...parsed, document_id: id });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al parsear CMF";
        logger.error({ err: e }, "parse-cmf");
        res.status(400).json({ message: msg });
      }
    }
  );

  app.post("/api/scoring/calculate", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const body = req.body as { user_id?: string; cartola_id?: string; cmf_id?: string };
      if (body.user_id && body.user_id !== userId) {
        return res.status(403).json({ message: "No autorizado para este usuario." });
      }
      const targetId = userId;

      const hasCartola = !!body.cartola_id?.trim();
      const hasCmf = !!body.cmf_id?.trim();

      if (!hasCartola && !hasCmf) {
        return res.status(400).json({
          message: "Indica cartola_id y/o cmf_id con documentos previamente parseados.",
        });
      }

      let cartola: CartolaParseResult | null = null;
      let cmf: CMFParseResult | null = null;

      if (hasCartola) {
        const doc = await storage.getDocumentUploadById(body.cartola_id!.trim(), targetId);
        if (!doc || doc.tipo !== "cartola") {
          return res.status(404).json({ message: "Cartola no encontrada." });
        }
        cartola = doc.parsedData as CartolaParseResult;
      }
      if (hasCmf) {
        const doc = await storage.getDocumentUploadById(body.cmf_id!.trim(), targetId);
        if (!doc || doc.tipo !== "cmf") {
          return res.status(404).json({ message: "Documento CMF no encontrado." });
        }
        cmf = doc.parsedData as CMFParseResult;
      }

      let transactional_score: TransactionalScoreResult | null = null;
      let credit_score: CreditScoreResult | null = null;
      const notas: string[] = [];

      if (cartola) {
        transactional_score = calculateTransactionalScore(cartola);
      }

      if (cmf && cartola && transactional_score) {
        credit_score = calculateCreditScore(cmf, cartola, transactional_score);
      } else if (cmf && !cartola) {
        credit_score = calculateCreditScoreCmfOnly(cmf);
        notas.push(
          "Solo CMF: el score crediticio no incluye comportamiento transaccional ni capacidad de pago desde cartola (no hay cartola cargada)."
        );
      } else if (cartola && transactional_score && !cmf) {
        const cmfDef = conservativeCmfPlaceholder();
        credit_score = calculateCreditScore(cmfDef, cartola, transactional_score);
        notas.push(
          "Solo cartola: el crediticio usa perfil CMF conservador (sin deuda registrada, referencia interna 85) porque no hay certificado CMF cargado."
        );
      }

      const insights: string[] = [];
      if (transactional_score) {
        insights.push(...transactional_score.insights);
      }
      if (cmf) {
        insights.push(`Score CMF interno (0–100): ${cmf.metricas.score_cmf}.`);
      }

      const summary = {
        score_principal: credit_score?.score ?? null,
        categoria: credit_score?.categoria ?? null,
        insights,
        recomendaciones: recomendacionesFromScores(credit_score, transactional_score),
        notas,
      };

      const scoreRowId = randomUUID();
      await storage.insertUserScore({
        id: scoreRowId,
        userId: targetId,
        scoreCrediticio: credit_score?.score ?? null,
        scoreTransaccional: transactional_score?.score ?? null,
        categoria: credit_score?.categoria ?? null,
        componentes: {
          credit: credit_score ?? null,
          transactional_subscores: transactional_score?.subscores ?? null,
        },
        insights: summary,
        documentosUsados: { cartola_id: body.cartola_id ?? null, cmf_id: body.cmf_id ?? null },
        periodoAnalizadoDesde: cartola?.periodo.desde.toISOString().slice(0, 10) ?? null,
        periodoAnalizadoHasta: cartola?.periodo.hasta.toISOString().slice(0, 10) ?? null,
      });

      res.json({
        transactional_score,
        credit_score,
        summary,
        score_id: scoreRowId,
      });
    } catch (e: unknown) {
      logger.error({ err: e }, "scoring/calculate");
      res.status(500).json({ message: e instanceof Error ? e.message : "Error al calcular scores" });
    }
  });

  app.get("/api/scoring/latest/:userId", authenticate, async (req: Request, res: Response) => {
    try {
      const authId = getUserId(req);
      const { userId } = req.params;
      if (userId !== authId) {
        return res.status(403).json({ message: "No autorizado." });
      }
      const row = await storage.getLatestUserScore(userId);
      if (!row) {
        return res.status(404).json({ message: "No hay scores guardados." });
      }
      res.json(row);
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : "Error" });
    }
  });
}
