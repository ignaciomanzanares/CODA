import { describe, it, expect } from 'vitest';
import { toSfaTransaction, fromSfaTransaction, buildSfaTransactionsResponse, type InternalTx } from '../sfaMapper.js';
import type { SfaTransaction } from '../sfaTypes.js';

describe('sfaMapper', () => {
  it('interno → SFA: salida = Débito, monto positivo, CLP entero, fecha ISO 8601 UTC', () => {
    const tx: InternalTx = {
      externalId: 'TXN987654', postedAt: '2025-02-10T10:00:00Z',
      amount: -250000, currency: 'CLP', description: 'Pago servicios básicos',
    };
    expect(toSfaTransaction(tx)).toEqual({
      transactionID: 'TXN987654',
      bookingDateTime: '2025-02-10T10:00:00Z',
      transactionType: 'Débito',
      amount: 250000,
      currency: 'CLP',
      description: 'Pago servicios básicos',
    });
  });

  it('interno → SFA: entrada = Crédito', () => {
    const r = toSfaTransaction({ postedAt: '2025-02-12T14:25:00Z', amount: 300000, currency: 'CLP', description: 'Abono sueldo febrero', externalId: 'TXN987655' });
    expect(r.transactionType).toBe('Crédito');
    expect(r.amount).toBe(300000);
  });

  it('CLP se redondea a entero; USD conserva 2 decimales', () => {
    expect(toSfaTransaction({ postedAt: '2025-02-10', amount: -250000.7, currency: 'CLP', description: 'x' }).amount).toBe(250001);
    expect(toSfaTransaction({ postedAt: '2025-02-10', amount: -12.345, currency: 'USD', description: 'x' }).amount).toBe(12.35);
  });

  it('fecha-only se normaliza a medianoche UTC', () => {
    expect(toSfaTransaction({ postedAt: '2025-02-10', amount: 1, currency: 'CLP', description: 'x' }).bookingDateTime).toBe('2025-02-10T00:00:00Z');
  });

  it('round-trip SFA → interno → SFA preserva el ejemplo oficial', () => {
    const official: SfaTransaction = {
      transactionID: 'TXN987654', bookingDateTime: '2025-02-10T10:00:00Z',
      transactionType: 'Débito', amount: 250000, currency: 'CLP', description: 'Pago servicios básicos',
    };
    const ob = fromSfaTransaction(official);
    expect(ob.amount).toBe(-250000); // Débito → firmado negativo
    const back = toSfaTransaction({ externalId: ob.externalId, postedAt: ob.postedAt, amount: ob.amount, currency: ob.currency, description: ob.description });
    expect(back).toEqual(official);
  });

  it('envelope: data.transactions + links(self/next) + meta(totalRecords/totalPages)', () => {
    const txs: InternalTx[] = Array.from({ length: 42 }, (_, i) => ({
      externalId: `T${i}`, postedAt: `2025-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      amount: i % 2 === 0 ? -1000 : 2000, currency: 'CLP', description: `m${i}`,
    }));
    const resp = buildSfaTransactionsResponse(txs, {
      baseUrl: 'https://api-chile.cl/accounts/v1/accounts/ACC123456/transactions',
      fromDate: '2025-02-01', toDate: '2025-02-28', page: 1, pageSize: 25,
    });
    expect(resp.data.transactions).toHaveLength(25);
    expect(resp.meta).toEqual({ totalRecords: 42, totalPages: 2 });
    expect(resp.links.self).toContain('page=1');
    expect(resp.links.next).toContain('page=2');
    expect(resp.links.prev).toBeUndefined();
  });
});

import { fromSfaLoan, aggregateCreditSignals, loanTypeToCmf } from '../sfaMapper.js';
import type { SfaLoan, SfaLoanBalance } from '../sfaTypes.js';

describe('sfaMapper — operaciones de crédito', () => {
  const loan: SfaLoan = {
    loanID: 'LN-10001', productName: 'Crédito de Consumo', loanType: 'CONSUMO', status: 'VIGENTE',
    approvedAmount: 5000000, currency: 'CLP', disbursementDate: '2023-01-18', maturityDate: '2027-01-15',
    interestRate: 1.12, rateType: 'FIJA', installmentFrequency: 'MENSUAL', totalInstallments: 48,
    gracePeriod: 0, collateralDetails: null,
  };
  const balance: SfaLoanBalance = {
    outstandingPrincipal: 3150000, accruedInterest: 24000, accruedLateInterest: 0,
    nextInstallmentAmount: 131200, nextInstallmentDueDate: '2025-03-15', currency: 'CLP',
    lastPaymentAmount: 131200, lastPaymentDate: '2025-02-15',
  };

  it('loanType → tipo CMF', () => {
    expect(loanTypeToCmf('CONSUMO')).toBe('consumo');
    expect(loanTypeToCmf('HIPOTECARIO')).toBe('vivienda');
    expect(loanTypeToCmf('COMERCIAL')).toBe('comercial');
    expect(loanTypeToCmf('LEASING')).toBe('otro');
  });

  it('loan + balance → operación de crédito (deuda total = principal+interés+mora)', () => {
    const op = fromSfaLoan(loan, balance);
    expect(op.tipoCredito).toBe('consumo');
    expect(op.vigente).toBe(true);
    expect(op.totalOutstanding).toBe(3174000); // 3150000 + 24000 + 0
    expect(op.tieneMora).toBe(false);
    expect(op.nextInstallment).toEqual({ amount: 131200, dueDate: '2025-03-15' });
  });

  it('detecta mora por accruedLateInterest > 0', () => {
    const op = fromSfaLoan(loan, { ...balance, accruedLateInterest: 5000 });
    expect(op.tieneMora).toBe(true);
    expect(op.totalOutstanding).toBe(3179000);
  });

  it('agrega señales de deuda para el evaluador de riesgo', () => {
    const ops = [
      fromSfaLoan(loan, balance),
      fromSfaLoan({ ...loan, loanID: 'LN-2', loanType: 'HIPOTECARIO' }, { ...balance, outstandingPrincipal: 40000000, accruedLateInterest: 1000 }),
    ];
    const s = aggregateCreditSignals(ops);
    expect(s.numOperaciones).toBe(2);
    expect(s.tieneDeuda).toBe(true);
    expect(s.tieneMora).toBe(true);
    expect(s.porTipo.consumo).toBe(3174000);
    expect(s.porTipo.vivienda).toBe(40025000);
  });
});

import { parseAmount, fromSfaAccountBalance, fromSfaCreditCard, fromSfaInvestment } from '../sfaMapper.js';
import type { SfaAccountBalance, SfaCreditCardBalance, SfaCreditCardLimit, SfaInvestment, SfaInvestmentBalance } from '../sfaTypes.js';

describe('sfaMapper — saldos cuenta/tarjeta/inversión', () => {
  it('parseAmount tolera string y número (inconsistencia del SFA)', () => {
    expect(parseAmount('120000')).toBe(120000);
    expect(parseAmount(120000)).toBe(120000);
    expect(parseAmount(null)).toBe(0);
  });

  it('saldo de cuenta (amount STRING) → saldo normalizado', () => {
    const b: SfaAccountBalance = { bookingDate: '2025-02-10T00:00:00Z', amount: '120000', currency: 'CLP', available: '115000', lockedAmount: '5000', type: 'ClosingBooked' };
    const r = fromSfaAccountBalance(b);
    expect(r.current).toBe(120000);
    expect(r.available).toBe(115000);
    expect(r.locked).toBe(5000);
    expect(r.currency).toBe('CLP');
  });

  it('tarjeta de crédito: deuda facturada + utilización del cupo', () => {
    const balance: SfaCreditCardBalance = { closingDate: '2025-02-25', currency: 'CLP', endOfMonthBalance: 1750000, minimumPaymentDue: 52000, dueDate: '2025-03-08', lastPaymentAmount: 200000, lastPaymentDate: '2025-01-10', debtType: 'REVOLVING' };
    const limit: SfaCreditCardLimit = { totalApproved: 2500000, unusedLine: 750000, currency: 'CLP', interestRate: 2.12, limitStartDate: '2023-05-01', limitEndDate: '2026-05-01', cashAdvancePercentage: 30, temporaryIncrease: null, debtType: 'REVOLVING' };
    const op = fromSfaCreditCard(balance, limit);
    expect(op.totalOutstanding).toBe(1750000);
    expect(op.tipoCredito).toBe('consumo');
    expect(op.utilization).toBeCloseTo((2500000 - 750000) / 2500000, 5); // 0.7
    expect(op.minimumPaymentDue).toBe(52000);
  });

  it('inversión → activo del usuario (usa valor actual del balance)', () => {
    const inv: SfaInvestment = { investmentType: 'FONDOS_MUTUOS', rutClient: '12.345.678-9', productId: 'INV-12345', productOwner: 'Banco Ejemplo', financialProductType: 'FONDOS_MUTUOS', commercialCategory: 'Balanceado', coverageStartDate: '2023-02-01', coverageEndDate: null, insuredAmount: 0, insuredCurrency: 'CLP', instrumentData: { fundSeries: 'Clase A', mnemonic: 'BAL-A', stockInvestment: 2500000 } };
    const bal: SfaInvestmentBalance = { amount: 2650000, currency: 'CLP', updatedDateTime: '2025-02-28T23:59:00Z', holdAmount: 0, arrearsBalance: 0 };
    const asset = fromSfaInvestment(inv, bal);
    expect(asset.productId).toBe('INV-12345');
    expect(asset.type).toBe('FONDOS_MUTUOS');
    expect(asset.name).toBe('Balanceado');
    expect(asset.estimatedValueClp).toBe(2650000); // del balance, no del instrumentData
  });

  it('inversión sin balance usa stockInvestment del instrumentData', () => {
    const inv: SfaInvestment = { investmentType: 'FONDOS_MUTUOS', rutClient: 'x', productId: 'INV-1', productOwner: 'B', financialProductType: 'FONDOS_MUTUOS', commercialCategory: 'Balanceado', coverageStartDate: '2023-01-01', coverageEndDate: null, insuredAmount: 0, insuredCurrency: 'CLP', instrumentData: { stockInvestment: 2500000 } };
    expect(fromSfaInvestment(inv).estimatedValueClp).toBe(2500000);
  });
});
