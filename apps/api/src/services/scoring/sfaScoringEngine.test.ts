/**
 * Test del SfaScoringEngine con datos ficticios.
 * Demuestra que el score cambia según el comportamiento financiero (cumplimiento CMF, explicabilidad).
 * Sin datos personales reales; solo RUT y montos de prueba.
 */

import { describe, it, expect } from 'vitest';
import { SfaScoringEngine } from './sfaScoringEngine.js';
import type { SfaTransaccionCuenta, SfaProductoVigenteCuenta, SfaProductoVigenteTarjeta } from '../../sfa/types.js';

const RUT_TEST = '11.111.111-1';

function txCuenta(
  fecha: string,
  tipo: 'abono' | 'cargo',
  monto: number,
  moneda: string = 'CLP'
): SfaTransaccionCuenta {
  return {
    rutCliente: RUT_TEST,
    idInternoTransaccion: `tx-${fecha}-${tipo}-${monto}`,
    fechaOperacion: fecha,
    fechaContableOperacion: fecha,
    tipoProductoFinanciero: 'A001',
    tipoOperacion: tipo,
    montoOperacion: monto,
    monedaOperacion: moneda,
  };
}

function cuentaVigente(
  saldo: number,
  lineaTotal: number,
  lineaUtilizada: number,
  moneda: string = 'CLP'
): SfaProductoVigenteCuenta {
  return {
    rutCliente: RUT_TEST,
    idInternoProducto: 'cuenta-1',
    fechaContratacionProducto: '2024-01-01',
    tipoProductoFinanciero: 'A001',
    saldo,
    moneda,
    lineaCreditoSobregiroTotal: lineaTotal,
    lineaCreditoSobregiroUtilizada: lineaUtilizada,
    lineaCreditoSobregiroDisponible: lineaTotal - lineaUtilizada,
  };
}

function tarjetaVigente(saldoDeuda: number, moneda: string = 'CLP'): SfaProductoVigenteTarjeta {
  return {
    rutCliente: RUT_TEST,
    idInternoProducto: 'tc-1',
    fechaContratacionProducto: '2024-01-01',
    tipoProductoFinanciero: 'B001',
    saldo: saldoDeuda,
    moneda,
    lineaTotalAprobada: 2000000,
    lineaNoUtilizada: 2000000 - saldoDeuda,
  };
}

describe('SfaScoringEngine', () => {
  const engine = new SfaScoringEngine();
  const refDate = new Date('2025-02-15');

  it('score más alto con buen comportamiento: muchos abonos, saldo positivo, poco uso de sobregiro', () => {
    const transactions: SfaTransaccionCuenta[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(refDate);
      d.setMonth(d.getMonth() - m);
      const y = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const base = `${y}-${mes}-15`;
      transactions.push(txCuenta(base, 'abono', 800000));
      transactions.push(txCuenta(base, 'cargo', -400000));
    }
    const products = [
      cuentaVigente(500000, 500000, 50000),
    ];
    const result = engine.run({ transactions, products }, refDate);
    expect(result.transactionalScore).toBeGreaterThan(600);
    expect(result.metrics?.monthsWithAbonos).toBeGreaterThanOrEqual(11);
    expect(result.metrics?.averageMonthlyBalanceClp).toBeGreaterThan(0);
    expect(result.mainInsights.some((i) => i.includes('estabilidad') || i.includes('abonos'))).toBe(true);
    expect(result.recommendedProducts).toContain('E001');
  });

  it('score más bajo con mal comportamiento: pocos abonos, uso alto de sobregiro', () => {
    const transactions: SfaTransaccionCuenta[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(refDate);
      d.setMonth(d.getMonth() - m);
      const y = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const base = `${y}-${mes}-05`;
      if (m < 4) transactions.push(txCuenta(base, 'abono', 300000));
      transactions.push(txCuenta(base, 'cargo', -200000));
    }
    const products = [
      cuentaVigente(-100000, 500000, 450000),
    ];
    const result = engine.run({ transactions, products }, refDate);
    expect(result.transactionalScore).toBeLessThan(500);
    expect(result.metrics?.monthsWithAbonos).toBeLessThan(6);
    expect(result.metrics?.overdraftUsageRatio).toBeGreaterThan(0.8);
    expect(result.recommendedProducts).toContain('C001');
    expect(result.recommendedProducts).toContain('C003');
  });

  it('detecta oportunidad de optimización: saldo en cuenta y deuda en tarjeta', () => {
    const transactions: SfaTransaccionCuenta[] = [];
    for (let m = 0; m < 6; m++) {
      const d = new Date(refDate);
      d.setMonth(d.getMonth() - m);
      const y = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      transactions.push(txCuenta(`${y}-${mes}-01`, 'abono', 600000));
      transactions.push(txCuenta(`${y}-${mes}-15`, 'cargo', -200000));
    }
    const products = [
      cuentaVigente(800000, 200000, 0),
      tarjetaVigente(350000),
    ];
    const result = engine.run({ transactions, products }, refDate);
    expect(result.metrics?.hasOptimizationOpportunity).toBe(true);
    expect(result.mainInsights.some((i) => i.includes('saldo') && i.includes('tarjeta'))).toBe(true);
    expect(result.recommendedProducts).toContain('C001');
  });

  it('normaliza moneda a CLP cuando se envían montos en USD', () => {
    const rates = { CLP: 1, USD: 950 };
    const transactions = [
      txCuenta('2025-01-15', 'abono', 1000, 'USD'),
      txCuenta('2025-01-20', 'cargo', -500, 'USD'),
    ];
    const products = [cuentaVigente(500000, 0, 0)];
    const result = engine.run({ transactions, products, exchangeRates: rates }, refDate);
    expect(result.metrics?.averageMonthlyBalanceClp).toBeGreaterThan(0);
    expect(result.transactionalScore).toBeGreaterThan(0);
  });

  it('marca meses con gap cuando no hay movimientos en algunos meses', () => {
    const transactions: SfaTransaccionCuenta[] = [];
    const d = new Date(refDate);
    d.setMonth(d.getMonth() - 11);
    transactions.push(txCuenta(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, 'abono', 500000));
    const products = [cuentaVigente(0, 0, 0)];
    const result = engine.run({ transactions, products }, refDate);
    expect(result.metrics?.monthsWithGap).toBeGreaterThan(0);
    expect(result.mainInsights.some((i) => i.includes('último saldo conocido') || i.includes('no hubo movimientos'))).toBe(true);
  });

  it('no incluye datos sensibles en insights ni metrics', () => {
    const transactions = [
      txCuenta('2025-01-15', 'abono', 100000),
    ];
    const products = [cuentaVigente(50000, 0, 0)];
    const result = engine.run({ transactions, products }, refDate);
    const allText = [...result.mainInsights, JSON.stringify(result.metrics)].join(' ');
    expect(allText).not.toMatch(/nombreContraparte|11\.111\.111-1/);
  });
});
