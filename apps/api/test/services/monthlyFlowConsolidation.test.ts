/**
 * Verificación del flujo consolidado en la UI (monthly-flow / dashboard / insights).
 *
 * Prueba el predicado compartido `isInternalTransferTx` sobre transacciones con la
 * forma PERSISTIDA (cartola JSON: tipo/monto + es_transferencia + category) y
 * replica la suma exacta que hace GET /api/transactions/monthly-flow, comparando
 * ANTES vs DESPUÉS del filtro. Demuestra que:
 *   - el fondeo/pago de tarjeta y las divisas (movimientos entre productos propios)
 *     se netean (ambas patas desaparecen), y
 *   - el consumo real (compras de comercio + PAGO COOPEUCH) y las transferencias a
 *     TERCEROS (marcadas es_transferencia=true por el parser de la cuenta corriente)
 *     se mantienen contados una sola vez.
 */
import { describe, it, expect } from 'vitest';
import { isInternalTransferTx } from '../../src/services/assistantContext.js';

// Forma persistida en documentUploads.parsed_data.transacciones (formato nuevo).
type StoredTx = {
  fecha: string;
  tipo: 'cargo' | 'abono';
  monto: number;
  descripcion: string;
  es_transferencia?: boolean;
  category?: string;
};

// Un mes representativo: cuenta corriente (CC) + tarjeta (TC) en el mismo store.
const MONTH: StoredTx[] = [
  { fecha: '2026-05-05', tipo: 'abono', monto: 2_500_000, descripcion: 'Pago Sueldo Empresa SpA', es_transferencia: false, category: 'Ingresos' }, // ingreso real
  { fecha: '2026-05-06', tipo: 'cargo', monto: 85_000, descripcion: 'Jumbo Bilbao', es_transferencia: false, category: 'Supermercado y almacén' }, // gasto real CC
  // ── plomería interna (debe netear a cero; ambas patas) ──
  { fecha: '2026-05-07', tipo: 'cargo', monto: 478_746, descripcion: 'Agustinas Traspaso Internet a T. Crédito', es_transferencia: true, category: 'Transferencia interna' }, // CC → fondeo tarjeta
  { fecha: '2026-05-07', tipo: 'cargo', monto: 390_139, descripcion: 'Agustinas Egreso por Compra de Divisas', es_transferencia: true, category: 'Inversión y divisas' },        // CC → divisas tarjeta USD
  { fecha: '2026-05-08', tipo: 'abono', monto: 478_746, descripcion: 'MONTO CANCELADO', es_transferencia: true, category: 'Transferencia interna' }, // pago tarjeta (otra pata)
  { fecha: '2026-05-08', tipo: 'abono', monto: 390_139, descripcion: 'ABONO DE DIVISAS', es_transferencia: true, category: 'Inversión y divisas' },   // divisas USD (otra pata)
  // ── consumo real de tarjeta (debe quedar, una vez cada uno) ──
  { fecha: '2026-05-10', tipo: 'cargo', monto: 482_053, descripcion: 'PAGO COOPEUCH', es_transferencia: false, category: 'Vivienda' },              // dividendo hipotecario — REAL
  { fecha: '2026-05-11', tipo: 'cargo', monto: 33_400, descripcion: 'STA ISABEL PROV BILBAO', es_transferencia: false, category: 'Supermercado y almacén' }, // compra tarjeta — REAL
  { fecha: '2026-05-12', tipo: 'cargo', monto: 22_830, descripcion: 'OPENAI *CHATGPT SUBSCR', es_transferencia: false, category: 'Suscripciones y software' }, // compra USD — REAL
];

// Réplica EXACTA de la agregación de GET /api/transactions/monthly-flow.
function monthlyFlow(txs: StoredTx[], filter: boolean) {
  let ingresos = 0, egresos = 0;
  for (const t of txs) {
    if (filter && isInternalTransferTx(t)) continue;
    if ('tipo' in t && typeof t.monto === 'number') {
      if (t.tipo === 'abono') ingresos += t.monto;
      else if (t.tipo === 'cargo') egresos += t.monto;
    }
  }
  return { ingresos, egresos };
}

describe('monthly-flow consolidado (UI)', () => {
  it('netea el fondeo/divisas y conserva el consumo real una sola vez', () => {
    const before = monthlyFlow(MONTH, false);
    const after = monthlyFlow(MONTH, true);

    // eslint-disable-next-line no-console
    console.log(`BEFORE  ingresos=${before.ingresos} egresos=${before.egresos}`);
    // eslint-disable-next-line no-console
    console.log(`AFTER   ingresos=${after.ingresos} egresos=${after.egresos}`);

    // ANTES: la plomería infla ambos lados (cifras crudas del enunciado).
    expect(before.ingresos).toBe(3_368_885);
    expect(before.egresos).toBe(1_492_168);

    // DESPUÉS: sólo ingreso real entra; sólo consumo real sale.
    expect(after.ingresos).toBe(2_500_000);
    expect(after.egresos).toBe(623_283);

    // El fondeo (478_746) y las divisas (390_139) se netean por completo.
    expect(before.egresos - after.egresos).toBe(478_746 + 390_139);
    // COOPEUCH (gasto real) sobrevive exactamente una vez.
    expect(MONTH.filter((t) => /COOPEUCH/.test(t.descripcion) && !isInternalTransferTx(t))).toHaveLength(1);
  });

  it('NO netea transferencias a terceros aunque vengan con es_transferencia=true', () => {
    // El parser de la cuenta corriente marca es_transferencia en "Transf a <persona>".
    const terceroEnviada: StoredTx = { fecha: '2026-05-13', tipo: 'cargo', monto: 120_000, descripcion: 'Transf a Juan Perez', es_transferencia: true, category: 'Transferencias' };
    const terceroRecibida: StoredTx = { fecha: '2026-05-14', tipo: 'abono', monto: 60_000, descripcion: 'Transferencia de Maria Soto', es_transferencia: true, category: 'Transferencias' };

    expect(isInternalTransferTx(terceroEnviada)).toBe(false);
    expect(isInternalTransferTx(terceroRecibida)).toBe(false);

    // Entran al flujo: el egreso a tercero suma a egresos, el abono a ingresos.
    const after = monthlyFlow([...MONTH, terceroEnviada, terceroRecibida], true);
    expect(after.egresos).toBe(623_283 + 120_000);
    expect(after.ingresos).toBe(2_500_000 + 60_000);
  });

  it('reconoce la plomería interna por glosa, categoría y flag', () => {
    // Glosa precisa (sin importar la categoría que le haya puesto el motor).
    expect(isInternalTransferTx({ descripcion: 'MONTO CANCELADO' })).toBe(true);
    expect(isInternalTransferTx({ descripcion: 'Traspaso Internet a T. Crédito' })).toBe(true);
    expect(isInternalTransferTx({ descripcion: 'Egreso por Compra de Divisas' })).toBe(true);
    // Etiqueta exacta de taxonomía.
    expect(isInternalTransferTx({ descripcion: 'pago', category: 'Transferencia interna' })).toBe(true);
    // Consumo real nunca se netea.
    for (const keep of ['PAGO COOPEUCH', 'STA ISABEL PROV BILBAO', 'OPENAI *CHATGPT SUBSCR', 'Jumbo Bilbao', 'Pago Sueldo Empresa SpA']) {
      expect(isInternalTransferTx({ descripcion: keep })).toBe(false);
    }
  });
});
