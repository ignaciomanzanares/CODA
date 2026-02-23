#!/usr/bin/env npx tsx
/**
 * Script de demostración: el Score Transaccional cambia según el comportamiento financiero.
 * Datos 100% ficticios; sin información personal real.
 * Uso: npx tsx apps/api/src/services/scoring/demo-score.ts
 */

import { SfaScoringEngine } from './sfaScoringEngine.js';
import type { SfaTransaccionCuenta, SfaProductoVigenteCuenta, SfaProductoVigenteTarjeta } from '../../sfa/types.js';

const RUT_DEMO = '11.111.111-1';
const refDate = new Date('2025-02-15');

function tx(fecha: string, tipo: 'abono' | 'cargo', monto: number): SfaTransaccionCuenta {
  return {
    rutCliente: RUT_DEMO,
    idInternoTransaccion: `demo-${fecha}-${tipo}`,
    fechaOperacion: fecha,
    fechaContableOperacion: fecha,
    tipoProductoFinanciero: 'A001',
    tipoOperacion: tipo,
    montoOperacion: monto,
    monedaOperacion: 'CLP',
  };
}

function cuenta(saldo: number, lineaTotal: number, lineaUtilizada: number): SfaProductoVigenteCuenta {
  return {
    rutCliente: RUT_DEMO,
    idInternoProducto: 'cuenta-1',
    fechaContratacionProducto: '2024-01-01',
    tipoProductoFinanciero: 'A001',
    saldo,
    moneda: 'CLP',
    lineaCreditoSobregiroTotal: lineaTotal,
    lineaCreditoSobregiroUtilizada: lineaUtilizada,
    lineaCreditoSobregiroDisponible: lineaTotal - lineaUtilizada,
  };
}

function tarjeta(saldoDeuda: number): SfaProductoVigenteTarjeta {
  return {
    rutCliente: RUT_DEMO,
    idInternoProducto: 'tc-1',
    fechaContratacionProducto: '2024-01-01',
    tipoProductoFinanciero: 'B001',
    saldo: saldoDeuda,
    moneda: 'CLP',
    lineaTotalAprobada: 2000000,
    lineaNoUtilizada: 2000000 - saldoDeuda,
  };
}

const engine = new SfaScoringEngine();

// Escenario A: buen comportamiento
const transaccionesBuenas: SfaTransaccionCuenta[] = [];
for (let m = 0; m < 12; m++) {
  const d = new Date(refDate);
  d.setMonth(d.getMonth() - m);
  const base = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
  transaccionesBuenas.push(tx(base, 'abono', 800000));
  transaccionesBuenas.push(tx(base, 'cargo', -400000));
}
const productosBuenos = [cuenta(500000, 500000, 50000)];

const resultadoBueno = engine.run(
  { transactions: transaccionesBuenas, products: productosBuenos },
  refDate
);

// Escenario B: mal comportamiento
const transaccionesMalas: SfaTransaccionCuenta[] = [];
for (let m = 0; m < 12; m++) {
  const d = new Date(refDate);
  d.setMonth(d.getMonth() - m);
  const base = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`;
  if (m < 4) transaccionesMalas.push(tx(base, 'abono', 300000));
  transaccionesMalas.push(tx(base, 'cargo', -200000));
}
const productosMalos = [cuenta(-100000, 500000, 450000)];

const resultadoMalo = engine.run(
  { transactions: transaccionesMalas, products: productosMalos },
  refDate
);

// Escenario C: oportunidad de optimización (saldo + deuda tarjeta)
const transaccionesOpt: SfaTransaccionCuenta[] = [];
for (let m = 0; m < 6; m++) {
  const d = new Date(refDate);
  d.setMonth(d.getMonth() - m);
  const base = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  transaccionesOpt.push(tx(base, 'abono', 600000));
  transaccionesOpt.push(tx(base, 'cargo', -200000));
}
const productosOpt = [cuenta(800000, 200000, 0), tarjeta(350000)];

const resultadoOpt = engine.run(
  { transactions: transaccionesOpt, products: productosOpt },
  refDate
);

console.log('=== Demo SfaScoringEngine – Score según comportamiento ===\n');

console.log('--- Escenario A: Buen comportamiento (ingresos estables, poco sobregiro) ---');
console.log('Score:', resultadoBueno.transactionalScore, '/ 1000');
console.log('Productos recomendados:', resultadoBueno.recommendedProducts.join(', '));
resultadoBueno.mainInsights.forEach((i) => console.log('  •', i));
console.log('');

console.log('--- Escenario B: Mal comportamiento (pocos abonos, alto uso de sobregiro) ---');
console.log('Score:', resultadoMalo.transactionalScore, '/ 1000');
console.log('Productos recomendados:', resultadoMalo.recommendedProducts.join(', '));
resultadoMalo.mainInsights.forEach((i) => console.log('  •', i));
console.log('');

console.log('--- Escenario C: Oportunidad de optimización (saldo en cuenta + deuda en tarjeta) ---');
console.log('Score:', resultadoOpt.transactionalScore, '/ 1000');
console.log('Productos recomendados:', resultadoOpt.recommendedProducts.join(', '));
resultadoOpt.mainInsights.forEach((i) => console.log('  •', i));
console.log('');

console.log('Resumen: A =', resultadoBueno.transactionalScore, ', B =', resultadoMalo.transactionalScore, ', C =', resultadoOpt.transactionalScore);
console.log('El score sube con mejor estabilidad de ingresos y menor uso de sobregiro; baja cuando hay deuda en tarjeta con saldo disponible (optimización).');
