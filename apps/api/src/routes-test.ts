/**
 * Rutas de simulación para probar flujo bancario sin integración real.
 * POST /api/test/simulate-bank-flow: consent pending → webhook authorized → mock SFA → score.
 */

import type { Express, Request, Response } from 'express';
import { Router } from 'express';
import { getConsentService } from './services/consent/index.js';
import { handleConsentWebhook } from './services/consent/webhooks.js';
import { computeLiquidityMetrics } from './services/risk/liquidityMetrics.js';
import type { AuthenticatedRequest } from './middleware/auth.js';
import { authenticate, ensureUserForToken } from './middleware/auth.js';
import type {
  SfaTransaccionCuenta,
  SfaProductoVigenteCuenta,
  SfaProductoVigenteTarjeta,
  SfaTransaccion,
  SfaProductoVigente,
} from './sfa/types.js';
import { logger } from './logger.js';
import { storage } from './storage.js';

const RUT_MOCK = '11.111.111-1';
const REF_DATE = new Date();

function mockTx(fecha: string, tipo: 'abono' | 'cargo', monto: number): SfaTransaccionCuenta {
  return {
    rutCliente: RUT_MOCK,
    idInternoTransaccion: `sim-${fecha}-${tipo}-${Math.abs(monto)}`,
    fechaOperacion: fecha,
    fechaContableOperacion: fecha,
    tipoProductoFinanciero: 'A001',
    tipoOperacion: tipo,
    montoOperacion: monto,
    monedaOperacion: 'CLP',
  };
}

function mockCuenta(saldo: number, lineaTotal: number, lineaUtilizada: number): SfaProductoVigenteCuenta {
  return {
    rutCliente: RUT_MOCK,
    idInternoProducto: 'sim-cuenta-1',
    fechaContratacionProducto: '2024-01-01',
    tipoProductoFinanciero: 'A001',
    saldo,
    moneda: 'CLP',
    lineaCreditoSobregiroTotal: lineaTotal,
    lineaCreditoSobregiroUtilizada: lineaUtilizada,
    lineaCreditoSobregiroDisponible: lineaTotal - lineaUtilizada,
  };
}

function mockTarjeta(saldoDeuda: number): SfaProductoVigenteTarjeta {
  return {
    rutCliente: RUT_MOCK,
    idInternoProducto: 'sim-tc-1',
    fechaContratacionProducto: '2024-01-01',
    tipoProductoFinanciero: 'B001',
    saldo: saldoDeuda,
    moneda: 'CLP',
    lineaTotalAprobada: 2000000,
    lineaNoUtilizada: Math.max(0, 2000000 - saldoDeuda),
  };
}

/** Genera transacciones y productos mock SFA (últimos 12 meses). Perfil estable → score ~750, insights de estabilidad/sobregiro, productos C001 y E001. */
function generateMockSfaData(): { transactions: SfaTransaccion[]; products: SfaProductoVigente[] } {
  const transactions: SfaTransaccionCuenta[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(REF_DATE);
    d.setMonth(d.getMonth() - m);
    const y = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const base = `${y}-${mes}-15`;
    transactions.push(mockTx(base, 'abono', 750000));
    transactions.push(mockTx(base, 'cargo', -280000)); // net +470k/mes → avg balance ~3M → score ~750
  }
  const products: SfaProductoVigente[] = [
    mockCuenta(450000, 500000, 80000), // sobregiro 16% (razonable); cuenta con saldo
    mockTarjeta(120000),               // deuda tarjeta → C001 + oportunidad optimización
  ];
  return { transactions, products };
}

export function registerTestRoutes(app: Express): void {
  const router = Router();

  /**
   * Simula el flujo completo: crear consent pending → webhook authorized → datos mock SFA → score.
   * Permite probar el frontend sin integración bancaria real.
   */
  router.post('/simulate-bank-flow', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userId = await ensureUserForToken(authReq.user);
    if (!userId) {
      return res.status(404).json({
        message: 'Usuario no encontrado en el sistema. Inicia sesión de nuevo o regístrate para usar la simulación SFA.',
      });
    }

    const consentService = getConsentService();

    try {
      // 1) Crear consentimiento en estado pending
      const grant = await consentService.create({
        userId,
        resourceTypes: ['account_information', 'products_vigentes'],
        ipiId: 'sim-ipi-bank',
      });
      if (!grant) {
        return res.status(500).json({ message: 'Failed to create consent' });
      }

      // 2) Asignar externalGrantId para que el webhook pueda identificar el grant
      const externalId = `sim-${grant.id}`;
      const updatedGrant = await consentService.setExternalGrantId(grant.id, userId, externalId);
      if (!updatedGrant) {
        return res.status(500).json({ message: 'Failed to set external grant id' });
      }

      // 3) Simular webhook del banco: pasar a authorized
      const webhookResult = await handleConsentWebhook({
        externalGrantId: externalId,
        status: 'authorized',
        ipiId: 'sim-ipi-bank',
      });
      if (!webhookResult.success || !webhookResult.grant) {
        return res.status(500).json({ message: 'Webhook simulation failed', detail: webhookResult.error });
      }
      const authorizedConsent = webhookResult.grant as typeof grant;

      // 4) Generar datos mock SFA y calcular métricas de liquidez (el score transaccional lo da
      // ahora el modelo XGB bajo demanda; el heurístico sfaScoringEngine fue eliminado).
      const { transactions, products } = generateMockSfaData();
      const metrics = computeLiquidityMetrics({ transactions, products }, REF_DATE);

      await storage.upsertTransactionalScore(userId, {
        transactionalScore: null,
        metrics,
        mainInsights: [],
        recommendedProducts: [],
        algorithmInputs: {
          pipeline: 'simulate_bank_flow_sfa',
          mockTransactionCount: transactions.length,
          mockProductCount: products.length,
        },
      });

      return res.json({
        consent: authorizedConsent,
        metrics,
      });
    } catch (e) {
      logger.error({ err: e }, 'Simulate bank flow failed');
      return res.status(500).json({ message: 'Simulation failed', error: (e as Error).message });
    }
  });

  app.use('/api/test', router);
}
