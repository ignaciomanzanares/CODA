import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from './middleware/auth.js';
import { apiLimiter, expensiveLimiter } from './middleware/rateLimiter.js';
import { storage } from './storage.js';
import { db, userAssets } from './db/index.js';
import { logger } from './logger.js';
import { evaluateHealthV2, deriveHealthInput, HEALTH_EVALUATION_ENGINE_VERSION } from './services/healthEvaluation/index.js';
import { logFinancialHealthV2 } from './services/audit/traceabilityPersistence.js';
import { estimarCuotaMensual, normalizeCmfData } from './services/healthEvaluation/userHealthService.js';
import type { UserAsset } from './services/assets/types.js';

const NIVEL_DESCRIPCION: Record<number, string> = {
  [-2]: 'Tu deuda supera tus activos o está en mora grave. Se recomienda asesoría legal para explorar reestructuración o proceso concursal.',
  [-1]: 'Tu carga de deuda es alta respecto a tu flujo. Una reestructuración puede reducir el peso mensual.',
  [0]: 'Estás al día en deudas pero sin excedente de ahorro. Un refinanciamiento preventivo puede mejorar tus condiciones.',
  [1]: 'Tienes excedente para empezar a ahorrar. El objetivo es construir un fondo de emergencia de 3 meses.',
  [2]: 'Tienes un fondo básico consolidado. Es momento de considerar instrumentos de mayor rendimiento.',
  [3]: 'Tu base financiera es sólida. Puedes diversificar con instrumentos de bajo riesgo como FFMM o ETF.',
  [4]: 'Tienes un portafolio diversificado activo. Considera ampliar a activos alternativos o internacionales.',
  [5]: 'Tus activos generan flujo sin necesidad de trabajo activo. El objetivo es optimizar y proteger el patrimonio.',
};

/** Shared handler for health evaluation — used by both GET /me and POST /recalculate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleHealthEvaluationMe(req: Request, res: Response): Promise<any> {
  const authReq = req as AuthenticatedRequest;
  const t0 = Date.now();
  try {
    const userId = authReq.user!.userId;
      const requestId = randomUUID();

      // Obtener datos de scoring persistidos
      // CMF: buscar ambos tipos — 'cmf' (parser nuevo) y 'cmf_informe_deudas' (parser antiguo)
      const [credit, txScore, cartolas, cmfDocsNew, cmfDocsLegacy] = await Promise.all([
        storage.getCreditScore(userId),
        storage.getTransactionalScore(userId),
        storage.listDocumentUploadsByType(userId, 'cartola'),
        storage.listDocumentUploadsByType(userId, 'cmf'),
        storage.listDocumentUploadsByType(userId, 'cmf_informe_deudas'),
      ]);
      const cmfDocs = [...cmfDocsNew, ...cmfDocsLegacy].sort(
        (a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime()
      );

      logger.info({ userId, cartolas: cartolas.length, cmfNew: cmfDocsNew.length, cmfLegacy: cmfDocsLegacy.length }, '[health-eval] docs found');

      if (cartolas.length === 0 || cmfDocs.length === 0) {
        return res.json({
          hasData: false,
          missingData: {
            cartola: cartolas.length === 0,
            cmf: cmfDocs.length === 0,
          },
        });
      }

      // Ingresos y gastos del último mes con datos, desde la tabla `transactions`
      // (fuente de verdad, no parsed_data). Se excluyen las transferencias internas
      // (pago de tarjeta/divisas) para no inflar ingreso ni ahorro — mismo predicado
      // consolidado que el resto de las métricas (Salud usa la vista REAL).
      const { getUserNormalizedTransactions } = await import('./services/normalizedTransactions.js');
      const { isInternalTransferTx } = await import('./services/assistantContext.js');
      const { transactions: normTxs } = await getUserNormalizedTransactions(userId);
      const latestMonth = normTxs.reduce((m, t) => (t.month > m ? t.month : m), '');
      let totalIngresos = 0, totalGastos = 0;
      for (const t of normTxs) {
        if (t.month !== latestMonth) continue;
        if (isInternalTransferTx(t)) continue;
        totalIngresos += t.abono;
        totalGastos += t.cargo;
      }

      // CMF más reciente — normaliza ambos formatos posibles
      const latestCmf = cmfDocs[0] as any;
      const rawCmfData = latestCmf?.parsedData;
      if (!rawCmfData) {
        return res.json({ hasData: false, missingData: { cartola: false, cmf: true } });
      }
      const cmfData = normalizeCmfData(rawCmfData);

      // Activos declarados del usuario
      const assetRows = await db.select().from(userAssets).where(eq(userAssets.userId, userId));
      const assets: UserAsset[] = assetRows.map((row: any) => ({
        id: row.id, userId: row.userId, type: row.type, name: row.name,
        acquisitionCostClp: row.acquisitionCostClp, estimatedValueClp: row.estimatedValueClp ?? null,
        hasLien: row.hasLien === 1 || row.hasLien === true, lienAmountClp: row.lienAmountClp ?? null,
        currency: row.currency, documentId: row.documentId ?? null,
        notes: row.notes ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
      }));

      // Derivar inputs del motor v2
      const deudaTotalClp: number = cmfData.deuda_total ?? 0;
      const deudaMensualClp = estimarCuotaMensual(cmfData, deudaTotalClp);
      const sfaAvg = txScore?.metrics?.averageMonthlyBalanceClp ?? undefined;

      const healthInput = deriveHealthInput({
        ingresoMensualClp: totalIngresos,
        deudaMensualClp,
        deudaTotalClp,
        ahorroMensualClp: totalIngresos - totalGastos,
        cmf: cmfData,
        sfaAvgMonthlyBalanceClp: sfaAvg,
        userAssets: assets,
      });

      const evaluation = evaluateHealthV2(healthInput, {
        creditScore: credit?.score ?? 0,
        transactionalScore: txScore?.transactionalScore ?? 0,
        monthlyIncome: totalIngresos,
        monthlyDebt: deudaMensualClp,
      });

      // Trazabilidad NCG 502 — persistida antes de responder (ver algorithmicTraceability.ts)
      await logFinancialHealthV2({
        userId,
        requestId,
        input: {
          deudaFlujo: evaluation.ratios.deudaFlujo,
          deudaActivos: evaluation.ratios.deudaActivos,
          ahorroIngreso: evaluation.ratios.ahorroIngreso,
          moraActiva: evaluation.ratios.moraActiva,
          diasMora: evaluation.ratios.diasMora,
        },
        output: {
          nivel: evaluation.nivel,
          nivelNombre: evaluation.nivelNombre,
          salida: evaluation.salida,
          zona: evaluation.zona,
          scoreCompuesto: evaluation.scoreCompuesto,
          scoreRatios: evaluation.scoreRatios,
          scoreInterno: evaluation.scoreInterno,
          nivelBruto: evaluation.nivelBruto,
        },
        processingTimeMs: Date.now() - t0,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({
        hasData: true,
        evaluation,
        modelVersion: HEALTH_EVALUATION_ENGINE_VERSION,
        descripcionNivel: NIVEL_DESCRIPCION[evaluation.nivel],
      });
    } catch (e) {
      logger.error({ err: e }, 'health-evaluation/me failed');
      res.status(500).json({ message: 'Error al evaluar salud financiera.' });
    }
}

export function registerHealthEvaluationRoutes(app: Express): void {
  // GET /api/health-evaluation/me — última evaluación del usuario
  app.get('/api/health-evaluation/me', apiLimiter, authenticate, handleHealthEvaluationMe);

  // POST /api/health-evaluation/recalculate — fuerza recálculo (misma lógica que GET /me)
  app.post('/api/health-evaluation/recalculate', expensiveLimiter, authenticate, handleHealthEvaluationMe);

  // GET /api/health-evaluation/level/:level — explica un nivel y su producto (requiere auth)
  app.get('/api/health-evaluation/level/:level', apiLimiter, authenticate, async (req: Request, res: Response) => {
    const level = parseInt(req.params.level, 10);
    if (isNaN(level) || level < -2 || level > 5) {
      return res.status(400).json({ message: 'Nivel debe estar entre -2 y 5.' });
    }

    const nivelInfo: Record<number, { nombre: string; salida: string; productoEjemplo: string }> = {
      [-2]: { nombre: 'Insolvencia activa', salida: 'Proceso concursal', productoEjemplo: 'Asesoría legal especializada' },
      [-1]: { nombre: 'Endeudado', salida: 'Reestructuración', productoEjemplo: 'Plan de pago estructurado' },
      [0]: { nombre: 'Sin deudas', salida: 'Refinanciamiento preventivo', productoEjemplo: 'Crédito de consolidación' },
      [1]: { nombre: 'Fondo básico', salida: 'Ahorro', productoEjemplo: 'Cuenta de ahorro' },
      [2]: { nombre: 'Fondo consolidado', salida: 'Ahorro', productoEjemplo: 'Depósito a plazo' },
      [3]: { nombre: 'Inversión inicial', salida: 'Inversión', productoEjemplo: 'Fondo mutuo o ETF' },
      [4]: { nombre: 'Inversión diversificada', salida: 'Inversión', productoEjemplo: 'Cartera diversificada multi-clase' },
      [5]: { nombre: 'Independencia financiera', salida: 'Gestión patrimonial', productoEjemplo: 'Gestión de patrimonio activo' },
    };

    res.json({
      nivel: level,
      ...nivelInfo[level],
      descripcion: NIVEL_DESCRIPCION[level],
    });
  });

  logger.info('🩺 Health evaluation routes registered');
}
