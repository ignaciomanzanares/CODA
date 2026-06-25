import type {
  SfaProductoVigente,
  SfaProductoVigenteCuenta,
  SfaProductoVigenteTarjeta,
  SfaTransaccionCuenta,
} from "../sfa/types.js";
import type { SfaScoringResult } from "./scoring/types.js";
import { SfaScoringEngine } from "./scoring/sfaScoringEngine.js";
import {
  getUserNormalizedTransactions,
  type NormalizedAccount,
  type NormalizedTx,
} from "./normalizedTransactions.js";

const SCORE_RUT_PLACEHOLDER = "00.000.000-0";

interface NormalizedScoreMetrics extends NonNullable<SfaScoringResult["metrics"]> {
  transactionCount: number;
  excludedInternalTransferCount: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  savingsRate: number;
  expenseRatio: number;
}

export interface NormalizedTransactionalScoreResult extends Omit<SfaScoringResult, "metrics"> {
  metrics: NormalizedScoreMetrics;
  transactionCount: number;
  excludedInternalTransferCount: number;
  source: "transactions_accounts";
}

function latestTransactionDate(transactions: NormalizedTx[]): Date {
  const latest = transactions.reduce((max, tx) => (tx.postedAt > max ? tx.postedAt : max), transactions[0]?.postedAt ?? "");
  return new Date(`${latest}T12:00:00Z`);
}

function toSfaTransactions(transactions: NormalizedTx[]): SfaTransaccionCuenta[] {
  return transactions.map((tx) => ({
    rutCliente: SCORE_RUT_PLACEHOLDER,
    idInternoTransaccion: `tx-${tx.id}`,
    fechaOperacion: tx.postedAt,
    fechaContableOperacion: tx.postedAt,
    tipoProductoFinanciero: tx.accountSubtype === "credit_card" ? "B001" : "A001",
    tipoOperacion: tx.tipo === "ingreso" ? "abono" : "cargo",
    montoOperacion: tx.tipo === "ingreso" ? Math.abs(tx.abono || tx.amount) : Math.abs(tx.cargo || tx.amount),
    monedaOperacion: "CLP",
  }));
}

function toSfaProducts(accounts: NormalizedAccount[]): SfaProductoVigente[] {
  return accounts.map((account) => {
    const isCreditCard = account.subtype === "credit_card" || account.type === "credit_card";
    if (isCreditCard) {
      const tarjeta: SfaProductoVigenteTarjeta = {
        rutCliente: SCORE_RUT_PLACEHOLDER,
        idInternoProducto: `account-${account.id}`,
        fechaContratacionProducto: "2025-01-01",
        tipoProductoFinanciero: "B001",
        saldo: 0,
        moneda: "CLP",
        lineaTotalAprobada: 0,
        lineaNoUtilizada: 0,
      };
      return tarjeta;
    }

    const cuenta: SfaProductoVigenteCuenta = {
      rutCliente: SCORE_RUT_PLACEHOLDER,
      idInternoProducto: `account-${account.id}`,
      fechaContratacionProducto: "2025-01-01",
      tipoProductoFinanciero: "A001",
      saldo: 0,
      moneda: "CLP",
      lineaCreditoSobregiroTotal: 0,
      lineaCreditoSobregiroUtilizada: 0,
      lineaCreditoSobregiroDisponible: 0,
    };
    return cuenta;
  });
}

export function computeNormalizedTransactionalScore(
  accounts: NormalizedAccount[],
  transactions: NormalizedTx[],
  engine = new SfaScoringEngine(),
): NormalizedTransactionalScoreResult | null {
  const realTransactions = transactions.filter((tx) => !tx.isInternalTransfer);
  if (realTransactions.length === 0) return null;

  const referenceDate = latestTransactionDate(realTransactions);
  const result = engine.run(
    {
      transactions: toSfaTransactions(realTransactions),
      products: toSfaProducts(accounts),
    },
    referenceDate,
  );

  const totalIncome = realTransactions.reduce((sum, tx) => sum + tx.abono, 0);
  const totalExpenses = realTransactions.reduce((sum, tx) => sum + tx.cargo, 0);
  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;
  const expenseRatio = totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0;

  return {
    ...result,
    source: "transactions_accounts",
    transactionCount: realTransactions.length,
    excludedInternalTransferCount: transactions.length - realTransactions.length,
    metrics: {
      ...result.metrics,
      transactionCount: realTransactions.length,
      excludedInternalTransferCount: transactions.length - realTransactions.length,
      totalIncome,
      totalExpenses,
      netBalance,
      savingsRate,
      expenseRatio,
    },
  };
}

export async function getNormalizedTransactionalScoreForUser(
  userId: string,
): Promise<NormalizedTransactionalScoreResult | null> {
  const { accounts, transactions } = await getUserNormalizedTransactions(userId);
  return computeNormalizedTransactionalScore(accounts, transactions);
}
