/**
 * CODA Empresas API - rutas bajo /api/empresas
 * Misma BD que CODA (tablas empresas_*).
 */

import express, { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import {
  db,
  eq,
  and,
  inArray,
  sql,
  empresasCompanies,
  empresasBankAccounts,
  empresasBankTransactions,
  empresasBankBalances,
  empresasDteDocuments,
  empresasPurchaseOrders,
  empresasReconciliationMatches,
  empresasRiskScores,
  empresasJournalEntries,
  empresasJournalLines,
  empresasChartOfAccounts,
} from "./db/index.js";
import {
  reconcile,
  generateIncomeStatement,
  generateCashFlowStatement,
  generateBalanceSheet,
} from "./empresas/core-finance/index.js";
import type {
  BankTransactionForMatch,
  DTEDocumentForMatch,
} from "./empresas/core-finance/index.js";
import type {
  JournalEntryInput,
  CashTransactionInput,
  AccountBalanceInput,
} from "./empresas/core-finance/index.js";
import { requireMembership, listMemberCompanyIds, grantMembership } from "./empresas/membership.js";
import {
  createMockOpenBankingConnector,
  createMockSIIConnector,
  createMockPurchaseOrdersConnector,
} from "./empresas/connectors/index.js";

const router = Router();

/** Todas las rutas CODA Empresas requieren JWT (misma identidad que CODA Personas; sesión independiente en el cliente). */
router.use((req: Request, res: Response, next: NextFunction) => {
  authenticate(req as AuthenticatedRequest, res, next);
});

// ========== COMPANIES ==========
router.get("/companies", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // #G: solo las empresas a las que el usuario pertenece (antes devolvía TODAS).
    const ids = await listMemberCompanyIds(req as AuthenticatedRequest);
    const result = ids.length
      ? await db.select().from(empresasCompanies).where(inArray(empresasCompanies.id, ids))
      : [];
    res.json({ data: result, count: result.length });
  } catch (error) {
    next(error);
  }
});

router.get("/companies/summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // #G: solo las empresas del usuario.
    const ids = await listMemberCompanyIds(req as AuthenticatedRequest);
    const allCompanies = ids.length
      ? await db.select().from(empresasCompanies).where(inArray(empresasCompanies.id, ids))
      : [];
    const summaries = await Promise.all(
      allCompanies.map(async (company: (typeof allCompanies)[0]) => {
        const accounts = await db
          .select()
          .from(empresasBankAccounts)
          .where(eq(empresasBankAccounts.companyId, company.id));
        const accountsByType: { checking: number; savings: number; credit: number } = {
          checking: 0,
          savings: 0,
          credit: 0,
        };
        let cashBalance = 0;
        for (const account of accounts) {
          const t = (account as { accountType?: string }).accountType;
          if (t === "checking") accountsByType.checking++;
          else if (t === "savings") accountsByType.savings++;
          else if (t === "credit") accountsByType.credit++;
          const balances = await db
            .select()
            .from(empresasBankBalances)
            .where(eq(empresasBankBalances.bankAccountId, account.id))
            .orderBy(sql`${empresasBankBalances.balanceDate} DESC`)
            .limit(1);
          if (balances[0]?.availableBalance) cashBalance += balances[0].availableBalance;
        }
        const txns = await db
          .select({ count: sql<number>`count(*)` })
          .from(empresasBankTransactions)
          .where(eq(empresasBankTransactions.companyId, company.id));
        const invoices = await db
          .select({ count: sql<number>`count(*)` })
          .from(empresasDteDocuments)
          .where(eq(empresasDteDocuments.companyId, company.id));
        const riskResult = await db
          .select()
          .from(empresasRiskScores)
          .where(eq(empresasRiskScores.companyId, company.id))
          .orderBy(sql`${empresasRiskScores.createdAt} DESC`)
          .limit(1);
        const lastTxn = await db
          .select({ date: empresasBankTransactions.createdAt })
          .from(empresasBankTransactions)
          .where(eq(empresasBankTransactions.companyId, company.id))
          .orderBy(sql`${empresasBankTransactions.createdAt} DESC`)
          .limit(1);
        return {
          ...company,
          summary: {
            cashBalance,
            transactionCount: Number(txns[0]?.count ?? 0),
            invoiceCount: Number(invoices[0]?.count ?? 0),
            riskRating: riskResult[0]?.rating ?? null,
            riskScore: riskResult[0]?.overallScore ?? null,
            lastSyncAt: lastTxn[0]?.date ?? null,
            accountsByType,
          },
        };
      }),
    );
    res.json({ data: summaries, count: summaries.length });
  } catch (error) {
    next(error);
  }
});

router.get("/companies/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid company ID" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, id))) return;
    const result = await db.select().from(empresasCompanies).where(eq(empresasCompanies.id, id));
    if (result.length === 0) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ========== TRANSACTIONS ==========
router.get("/transactions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyIdParam = req.query.company_id;
    if (!companyIdParam || typeof companyIdParam !== "string") {
      res.status(400).json({ error: "company_id query parameter is required" });
      return;
    }
    const companyId = parseInt(companyIdParam, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const rows = await db
      .select({
        id: empresasBankTransactions.id,
        companyId: empresasBankTransactions.companyId,
        bankAccountId: empresasBankTransactions.bankAccountId,
        transactionDate: empresasBankTransactions.transactionDate,
        postedDate: empresasBankTransactions.postedDate,
        amount: empresasBankTransactions.amount,
        currency: empresasBankTransactions.currency,
        description: empresasBankTransactions.description,
        counterpartyName: empresasBankTransactions.counterpartyName,
        counterpartyRut: empresasBankTransactions.counterpartyRut,
        reference: empresasBankTransactions.reference,
        status: empresasBankTransactions.status,
        category: empresasBankTransactions.category,
        createdAt: empresasBankTransactions.createdAt,
        accountType: empresasBankAccounts.accountType,
        accountNumber: empresasBankAccounts.accountNumber,
      })
      .from(empresasBankTransactions)
      .leftJoin(
        empresasBankAccounts,
        eq(empresasBankTransactions.bankAccountId, empresasBankAccounts.id),
      )
      .where(eq(empresasBankTransactions.companyId, companyId))
      .orderBy(empresasBankTransactions.transactionDate);
    res.json({ data: rows, count: rows.length });
  } catch (error) {
    next(error);
  }
});

// ========== DASHBOARD ==========
router.get("/dashboard/:company_id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = parseInt(req.params.company_id, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const companyResult = await db
      .select()
      .from(empresasCompanies)
      .where(eq(empresasCompanies.id, companyId));
    if (companyResult.length === 0) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const company = companyResult[0];
    const transactions = await db
      .select()
      .from(empresasBankTransactions)
      .where(eq(empresasBankTransactions.companyId, companyId));
    let totalRevenue = 0,
      totalExpenses = 0;
    for (const txn of transactions) {
      if (txn.amount > 0) totalRevenue += txn.amount;
      else totalExpenses += Math.abs(txn.amount);
    }
    const issuedInvoices = await db
      .select()
      .from(empresasDteDocuments)
      .where(
        and(
          eq(empresasDteDocuments.companyId, companyId),
          eq(empresasDteDocuments.direction, "issued"),
          eq(empresasDteDocuments.status, "valid"),
        ),
      );
    const receivedInvoices = await db
      .select()
      .from(empresasDteDocuments)
      .where(
        and(
          eq(empresasDteDocuments.companyId, companyId),
          eq(empresasDteDocuments.direction, "received"),
          eq(empresasDteDocuments.status, "valid"),
        ),
      );
    const invoiceRevenue = issuedInvoices.reduce(
      (s: number, i: { netAmount: number }) => s + i.netAmount,
      0,
    );
    const invoiceExpenses = receivedInvoices.reduce(
      (s: number, i: { netAmount: number }) => s + i.netAmount,
      0,
    );
    const grossProfit = invoiceRevenue - invoiceExpenses;
    const netMargin = invoiceRevenue > 0 ? (grossProfit / invoiceRevenue) * 100 : 0;
    const accountsResult = await db
      .select()
      .from(empresasBankAccounts)
      .where(eq(empresasBankAccounts.companyId, companyId));
    let cashBalance = 0;
    for (const acc of accountsResult) {
      const bal = await db
        .select()
        .from(empresasBankBalances)
        .where(eq(empresasBankBalances.bankAccountId, acc.id))
        .orderBy(sql`${empresasBankBalances.balanceDate} DESC`)
        .limit(1);
      if (bal[0]?.currentBalance) cashBalance += bal[0].currentBalance;
    }
    const now = new Date();
    const getStatus = (lastSync: string | null) => {
      if (!lastSync) return "no_data";
      const h = (now.getTime() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
      return h <= 24 ? "fresh" : "stale";
    };
    const latestTxn = await db
      .select({ createdAt: empresasBankTransactions.createdAt })
      .from(empresasBankTransactions)
      .where(eq(empresasBankTransactions.companyId, companyId))
      .orderBy(sql`${empresasBankTransactions.createdAt} DESC`)
      .limit(1);
    const latestDte = await db
      .select({ createdAt: empresasDteDocuments.createdAt })
      .from(empresasDteDocuments)
      .where(eq(empresasDteDocuments.companyId, companyId))
      .orderBy(sql`${empresasDteDocuments.createdAt} DESC`)
      .limit(1);
    const latestPo = await db
      .select({ createdAt: empresasPurchaseOrders.createdAt })
      .from(empresasPurchaseOrders)
      .where(eq(empresasPurchaseOrders.companyId, companyId))
      .orderBy(sql`${empresasPurchaseOrders.createdAt} DESC`)
      .limit(1);
    const poCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(empresasPurchaseOrders)
      .where(eq(empresasPurchaseOrders.companyId, companyId));
    const dataFreshness = [
      {
        connector: "Open Banking",
        lastSync: latestTxn[0]?.createdAt ?? null,
        status: getStatus(latestTxn[0]?.createdAt ?? null),
        recordCount: transactions.length,
      },
      {
        connector: "SII DTE",
        lastSync: latestDte[0]?.createdAt ?? null,
        status: getStatus(latestDte[0]?.createdAt ?? null),
        recordCount: issuedInvoices.length + receivedInvoices.length,
      },
      {
        connector: "Órdenes de Compra",
        lastSync: latestPo[0]?.createdAt ?? null,
        status: getStatus(latestPo[0]?.createdAt ?? null),
        recordCount: Number(poCount[0]?.count ?? 0),
      },
    ];
    res.json({
      data: {
        companyId,
        companyName: company.name,
        period: new Date().toISOString().slice(0, 7),
        revenue: invoiceRevenue,
        expenses: invoiceExpenses,
        grossProfit,
        ebitda: grossProfit,
        netMargin: Math.round(netMargin * 100) / 100,
        cashBalance,
        transactionCount: transactions.length,
        invoiceCount: issuedInvoices.length + receivedInvoices.length,
        dataFreshness,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ========== RISK ==========
router.get("/risk/:company_id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = parseInt(req.params.company_id, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const companyResult = await db
      .select()
      .from(empresasCompanies)
      .where(eq(empresasCompanies.id, companyId));
    if (companyResult.length === 0) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const riskResult = await db
      .select()
      .from(empresasRiskScores)
      .where(eq(empresasRiskScores.companyId, companyId))
      .orderBy(sql`${empresasRiskScores.assessmentDate} DESC`)
      .limit(1);
    if (riskResult.length === 0) {
      res.status(404).json({ error: "No risk assessment found for this company" });
      return;
    }
    const r = riskResult[0];
    let factorsJson: Record<string, Record<string, { value: number; score: number }>> = {};
    let redFlagsJson: string[] = [];
    let recommendationsJson: Array<{ product: string; maxAmount: number }> = [];
    try {
      if (r.factors) factorsJson = JSON.parse(r.factors);
      if (r.redFlags) redFlagsJson = JSON.parse(r.redFlags);
      if (r.recommendations) recommendationsJson = JSON.parse(r.recommendations);
    } catch (_) {}
    const factorMeta: Record<string, { name: string; category: string; weight: number }> = {
      currentRatio: { name: "Ratio Corriente", category: "liquidity", weight: 20 },
      quickRatio: { name: "Ratio Ácido", category: "liquidity", weight: 10 },
      debtToEbitda: { name: "Deuda/EBITDA", category: "leverage", weight: 15 },
      interestCoverage: { name: "Cobertura Intereses", category: "leverage", weight: 10 },
      ebitdaMargin: { name: "Margen EBITDA", category: "profitability", weight: 15 },
      netMargin: { name: "Margen Neto", category: "profitability", weight: 10 },
      cashConversion: { name: "Conversión Caja", category: "cash_flow", weight: 8 },
      clientConcentration: { name: "Concentración Clientes", category: "concentration", weight: 7 },
      dso: { name: "Días de Cobro (DSO)", category: "concentration", weight: 5 },
    };
    const factors: Array<{
      name: string;
      category: string;
      value: string;
      score: number;
      weight: number;
      status: string;
      explanation: string;
    }> = [];
    for (const [_cat, categoryFactors] of Object.entries(factorsJson)) {
      for (const [factorKey, factorData] of Object.entries(
        categoryFactors as Record<string, { value: number; score: number }>,
      )) {
        const meta = factorMeta[factorKey];
        if (
          meta &&
          factorData &&
          typeof factorData.value === "number" &&
          typeof factorData.score === "number"
        ) {
          factors.push({
            name: meta.name,
            category: meta.category,
            value: factorData.value.toFixed(2),
            score: factorData.score,
            weight: meta.weight,
            status:
              factorData.score >= 70 ? "good" : factorData.score >= 50 ? "warning" : "critical",
            explanation: `Score ${factorData.score}/100 para ${meta.name}.`,
          });
        }
      }
    }
    const recommendations = recommendationsJson.map((rec) => ({
      product: rec.product,
      maxAmount: rec.maxAmount ?? 0,
      suitability:
        (rec.maxAmount ?? 0) >= 10000000
          ? "high"
          : (rec.maxAmount ?? 0) >= 5000000
            ? "medium"
            : "low",
      description: `Monto máximo: ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(rec.maxAmount ?? 0)}`,
    }));
    res.json({
      data: {
        rating: r.rating ?? "C",
        numericScore: r.overallScore ?? 50,
        lastCalculated: r.assessmentDate ?? new Date().toISOString().split("T")[0],
        factors,
        redFlags: redFlagsJson,
        recommendations,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ========== RECONCILIATION ==========
router.get(
  "/reconciliation/:company_id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseInt(req.params.company_id, 10);
      if (isNaN(companyId)) {
        res.status(400).json({ error: "Invalid company_id" });
        return;
      }
      if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
      const companyResult = await db
        .select()
        .from(empresasCompanies)
        .where(eq(empresasCompanies.id, companyId));
      if (companyResult.length === 0) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const matches = await db
        .select()
        .from(empresasReconciliationMatches)
        .where(eq(empresasReconciliationMatches.companyId, companyId));
      const matchedTxnIds = new Set(
        matches.map((m: { bankTransactionId: number }) => m.bankTransactionId),
      );
      const matchedDocIds = new Set(
        matches
          .filter((m: { dteDocumentId: number | null }) => m.dteDocumentId)
          .map((m: { dteDocumentId: number | null }) => m.dteDocumentId!),
      );
      const allTransactions = await db
        .select()
        .from(empresasBankTransactions)
        .where(eq(empresasBankTransactions.companyId, companyId));
      const unmatchedTransactions = allTransactions
        .filter((t: { id: number }) => !matchedTxnIds.has(t.id))
        .map(
          (t: {
            id: number;
            transactionDate: string;
            description: string | null;
            amount: number;
            counterpartyName: string | null;
            reference: string | null;
          }) => ({
            id: t.id,
            date: t.transactionDate,
            description: t.description ?? "",
            amount: t.amount,
            counterparty: t.counterpartyName,
            reference: t.reference,
          }),
        );
      const allDocs = await db
        .select()
        .from(empresasDteDocuments)
        .where(eq(empresasDteDocuments.companyId, companyId));
      const unmatchedInvoices = allDocs
        .filter((d: { id: number }) => !matchedDocIds.has(d.id))
        .map(
          (d: {
            id: number;
            folio: number;
            issueDate: string;
            emitterName: string | null;
            emitterRut: string;
            receiverName: string | null;
            receiverRut: string;
            totalAmount: number;
            direction: string;
          }) => ({
            id: d.id,
            folio: d.folio,
            date: d.issueDate,
            emitter: d.emitterName ?? d.emitterRut,
            receiver: d.receiverName ?? d.receiverRut,
            total: d.totalAmount,
            type: d.direction,
          }),
        );
      const matchDetails = await Promise.all(
        matches.map(async (m: { bankTransactionId: number; dteDocumentId: number | null }) => {
          const txn = allTransactions.find((t: { id: number }) => t.id === m.bankTransactionId);
          const doc = m.dteDocumentId
            ? allDocs.find((d: { id: number }) => d.id === m.dteDocumentId)
            : null;
          return {
            ...m,
            transaction: txn
              ? {
                  id: txn.id,
                  date: txn.transactionDate,
                  description: txn.description,
                  amount: txn.amount,
                  counterparty: txn.counterpartyName,
                }
              : null,
            document: doc
              ? {
                  id: doc.id,
                  folio: doc.folio,
                  date: doc.issueDate,
                  total: doc.totalAmount,
                  type: doc.direction,
                }
              : null,
          };
        }),
      );
      res.json({
        data: {
          matches: matchDetails,
          unmatchedTransactions,
          unmatchedInvoices,
          summary: {
            totalTransactions: allTransactions.length,
            totalDocuments: allDocs.length,
            matchedCount: matches.length,
            unmatchedTransactionCount: unmatchedTransactions.length,
            unmatchedDocumentCount: unmatchedInvoices.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/reconciliation/:company_id/run",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseInt(req.params.company_id, 10);
      if (isNaN(companyId)) {
        res.status(400).json({ error: "Invalid company_id" });
        return;
      }
      if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
      const companyResult = await db
        .select()
        .from(empresasCompanies)
        .where(eq(empresasCompanies.id, companyId));
      if (companyResult.length === 0) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const existingMatches = await db
        .select({ bankTransactionId: empresasReconciliationMatches.bankTransactionId })
        .from(empresasReconciliationMatches)
        .where(eq(empresasReconciliationMatches.companyId, companyId));
      const alreadyMatchedIds = new Set(
        existingMatches.map((m: { bankTransactionId: number }) => m.bankTransactionId),
      );
      const transactions = await db
        .select()
        .from(empresasBankTransactions)
        .where(eq(empresasBankTransactions.companyId, companyId));
      const unmatchedTxns = transactions.filter(
        (t: { id: number }) => !alreadyMatchedIds.has(t.id),
      );
      const documents = await db
        .select()
        .from(empresasDteDocuments)
        .where(eq(empresasDteDocuments.companyId, companyId));
      const existingDocMatches = await db
        .select({ dteDocumentId: empresasReconciliationMatches.dteDocumentId })
        .from(empresasReconciliationMatches)
        .where(
          and(
            eq(empresasReconciliationMatches.companyId, companyId),
            sql`${empresasReconciliationMatches.dteDocumentId} IS NOT NULL`,
          ),
        );
      const alreadyMatchedDocIds = new Set(
        existingDocMatches.map((m: { dteDocumentId: number | null }) => m.dteDocumentId!),
      );
      const unmatchedDocs = documents.filter(
        (d: { id: number }) => !alreadyMatchedDocIds.has(d.id),
      );
      const txnsForMatch: BankTransactionForMatch[] = unmatchedTxns.map(
        (t: {
          id: number;
          amount: number;
          transactionDate: string;
          counterpartyName: string | null;
          counterpartyRut: string | null;
          reference: string | null;
        }) => ({
          id: t.id,
          amount: t.amount,
          transactionDate: t.transactionDate,
          counterpartyName: t.counterpartyName ?? undefined,
          counterpartyRut: t.counterpartyRut ?? undefined,
          reference: t.reference ?? undefined,
        }),
      );
      const docsForMatch: DTEDocumentForMatch[] = unmatchedDocs.map(
        (d: {
          id: number;
          totalAmount: number;
          issueDate: string;
          direction: string;
          emitterRut: string;
          receiverRut: string;
          emitterName: string | null;
          receiverName: string | null;
          folio: number;
        }) => ({
          id: d.id,
          totalAmount: d.totalAmount,
          issueDate: d.issueDate,
          direction: d.direction as "issued" | "received",
          emitterRut: d.emitterRut,
          receiverRut: d.receiverRut,
          emitterName: d.emitterName ?? "",
          receiverName: d.receiverName ?? "",
          folio: d.folio,
        }),
      );
      const result = reconcile(txnsForMatch, docsForMatch, {
        minScore: 60,
        maxDateDiff: 7,
        amountTolerance: 0.05,
      });
      const now = new Date().toISOString();
      let savedCount = 0;
      for (const match of result.matches) {
        await db.insert(empresasReconciliationMatches).values({
          companyId,
          bankTransactionId: match.bankTransactionId,
          dteDocumentId: match.dteDocumentId,
          matchScore: match.score,
          matchType: "auto",
          matchStatus: match.score >= 80 ? "matched" : "exception",
          matchedAt: now,
          notes: `Auto-matched score ${match.score}.`,
        });
        savedCount++;
      }
      res.json({
        data: {
          processed: txnsForMatch.length,
          matched: result.matchedCount,
          saved: savedCount,
          matchRate: result.matchRate,
          unmatchedTransactions: result.unmatchedTransactions.length,
          unmatchedDocuments: result.unmatchedDocuments.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ========== STATEMENTS ==========
function parsePeriod(period: string): { periodStart: string; periodEnd: string } {
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
      periodEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  const yearMatch = period.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return { periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    periodStart: `${y}-${String(m).padStart(2, "0")}-01`,
    periodEnd: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

router.get("/statements/:company_id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = parseInt(req.params.company_id, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const companyResult = await db
      .select()
      .from(empresasCompanies)
      .where(eq(empresasCompanies.id, companyId));
    if (companyResult.length === 0) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const periodParam = (req.query.period as string) || "";
    const { periodStart, periodEnd } = parsePeriod(periodParam);
    const period = periodParam.match(/^(\d{4})(-\d{2})?$/)
      ? periodParam
      : periodStart.substring(0, 7);

    const journalData = await db
      .select({
        entryDate: empresasJournalEntries.entryDate,
        accountCode: empresasChartOfAccounts.code,
        accountName: empresasChartOfAccounts.name,
        debit: empresasJournalLines.debit,
        credit: empresasJournalLines.credit,
      })
      .from(empresasJournalLines)
      .innerJoin(
        empresasJournalEntries,
        eq(empresasJournalLines.journalEntryId, empresasJournalEntries.id),
      )
      .innerJoin(
        empresasChartOfAccounts,
        eq(empresasJournalLines.accountId, empresasChartOfAccounts.id),
      )
      .where(
        and(
          eq(empresasJournalEntries.companyId, companyId),
          sql`${empresasJournalEntries.entryDate} >= ${periodStart}`,
          sql`${empresasJournalEntries.entryDate} <= ${periodEnd}`,
        ),
      );
    const journalInputs: JournalEntryInput[] = journalData.map(
      (row: {
        accountCode: string;
        accountName: string;
        debit: number | null;
        credit: number | null;
        entryDate: string;
      }) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        debit: row.debit ?? 0,
        credit: row.credit ?? 0,
        entryDate: row.entryDate,
      }),
    );
    const incomeStmt = generateIncomeStatement(journalInputs, periodStart, periodEnd);
    const incomeStatementLines = [
      ...incomeStmt.revenue.map((item) => ({
        label: item.accountName,
        amount: item.amount,
        indent: 1,
      })),
      {
        label: "Total Ingresos",
        amount: incomeStmt.revenue.reduce((s: number, i: { amount: number }) => s + i.amount, 0),
        isSubtotal: true,
      },
      ...incomeStmt.costOfSales.map((item) => ({
        label: item.accountName,
        amount: -item.amount,
        indent: 1,
      })),
      { label: "Utilidad Bruta", amount: incomeStmt.grossProfit, isSubtotal: true },
      ...incomeStmt.operatingExpenses.map((item) => ({
        label: item.accountName,
        amount: -item.amount,
        indent: 1,
      })),
      { label: "Utilidad Neta", amount: incomeStmt.netIncome, isTotal: true },
    ];

    const transactions = await db
      .select()
      .from(empresasBankTransactions)
      .where(
        and(
          eq(empresasBankTransactions.companyId, companyId),
          sql`${empresasBankTransactions.transactionDate} >= ${periodStart}`,
          sql`${empresasBankTransactions.transactionDate} <= ${periodEnd}`,
        ),
      )
      .orderBy(empresasBankTransactions.transactionDate);
    const priorTotal = await db
      .select({ total: sql<number>`SUM(${empresasBankTransactions.amount})` })
      .from(empresasBankTransactions)
      .where(
        and(
          eq(empresasBankTransactions.companyId, companyId),
          sql`${empresasBankTransactions.transactionDate} < ${periodStart}`,
        ),
      );
    const beginningCash = priorTotal[0]?.total ?? 0;
    const cashInputs: CashTransactionInput[] = transactions.map(
      (t: {
        id: number;
        amount: number;
        transactionDate: string;
        description: string | null;
        category: string | null;
      }) => ({
        id: t.id,
        amount: t.amount,
        transactionDate: t.transactionDate,
        transactionType: t.amount >= 0 ? "inflow" : "outflow",
        description: t.description ?? "",
        category: t.category ?? undefined,
      }),
    );
    const cashFlowStmt = generateCashFlowStatement(cashInputs, periodStart, periodEnd, {
      beginningCash,
    });
    const cashFlowLines = [
      {
        label: "Flujo Neto Operación",
        amount: cashFlowStmt.operatingActivities.total,
        isSubtotal: true,
      },
      { label: "Variación Neta de Caja", amount: cashFlowStmt.netCashChange, isTotal: true },
      { label: "Saldo Inicial", amount: cashFlowStmt.beginningCash },
      { label: "Saldo Final", amount: cashFlowStmt.endingCash, isTotal: true },
    ];

    const accountBalancesData = await db
      .select({
        accountCode: empresasChartOfAccounts.code,
        accountName: empresasChartOfAccounts.name,
        totalDebit: sql<number>`SUM(${empresasJournalLines.debit})`,
        totalCredit: sql<number>`SUM(${empresasJournalLines.credit})`,
      })
      .from(empresasJournalLines)
      .innerJoin(
        empresasJournalEntries,
        eq(empresasJournalLines.journalEntryId, empresasJournalEntries.id),
      )
      .innerJoin(
        empresasChartOfAccounts,
        eq(empresasJournalLines.accountId, empresasChartOfAccounts.id),
      )
      .where(
        and(
          eq(empresasJournalEntries.companyId, companyId),
          sql`${empresasJournalEntries.entryDate} <= ${periodEnd}`,
        ),
      )
      .groupBy(empresasChartOfAccounts.code, empresasChartOfAccounts.name);
    const accountBalances: AccountBalanceInput[] = accountBalancesData.map(
      (row: {
        accountCode: string;
        accountName: string;
        totalDebit: number | null;
        totalCredit: number | null;
      }) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        balance: (row.totalDebit ?? 0) - (row.totalCredit ?? 0),
      }),
    );
    if (
      !accountBalances.some((a) => a.accountCode.startsWith("111")) &&
      cashFlowStmt.endingCash !== 0
    ) {
      accountBalances.push({
        accountCode: "1110",
        accountName: "Caja y Bancos",
        balance: cashFlowStmt.endingCash,
      });
    }
    const balanceSheetStmt = generateBalanceSheet(accountBalances, periodEnd);
    const balanceSheetLines = [
      { label: "TOTAL ACTIVOS", amount: balanceSheetStmt.totalAssets, isTotal: true },
      { label: "TOTAL PASIVOS", amount: -balanceSheetStmt.liabilities.total, isTotal: true },
      {
        label: "TOTAL PATRIMONIO",
        amount: -balanceSheetStmt.equity.total + incomeStmt.netIncome,
        isTotal: true,
      },
    ];

    res.json({
      data: {
        period,
        incomeStatement: incomeStatementLines,
        cashFlow: cashFlowLines,
        balanceSheet: balanceSheetLines,
        metadata: {
          journalEntriesCount: journalData.length,
          transactionsCount: transactions.length,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ========== DOCUMENTS (DTE) ==========
router.get("/documents", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyIdParam = req.query.company_id;
    if (!companyIdParam || typeof companyIdParam !== "string") {
      res.status(400).json({ error: "company_id query parameter is required" });
      return;
    }
    const companyId = parseInt(companyIdParam, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const result = await db
      .select()
      .from(empresasDteDocuments)
      .where(eq(empresasDteDocuments.companyId, companyId))
      .orderBy(sql`${empresasDteDocuments.issueDate} DESC`);
    res.json({ data: result, count: result.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/empresas/documents — Emitir DTE desde la plataforma
 * Body: { companyId, documentType?, receiverRut, receiverName?, netAmount, vatAmount?, issueDate? }
 */
router.post("/documents", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      companyId: number;
      documentType?: string;
      receiverRut: string;
      receiverName?: string;
      netAmount: number;
      vatAmount?: number;
      issueDate?: string;
    };
    const companyId = Number(body.companyId);
    if (!companyId || isNaN(companyId)) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const companyRows = await db
      .select()
      .from(empresasCompanies)
      .where(eq(empresasCompanies.id, companyId));
    if (companyRows.length === 0) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const company = companyRows[0] as { id: number; name: string; rut: string };
    const receiverRut = String(body.receiverRut || "").trim();
    if (!receiverRut) {
      res.status(400).json({ error: "receiverRut is required" });
      return;
    }
    const netAmount = Number(body.netAmount);
    if (isNaN(netAmount) || netAmount < 0) {
      res.status(400).json({ error: "netAmount must be a positive number" });
      return;
    }
    const vatAmount =
      body.vatAmount != null ? Number(body.vatAmount) : Math.round(netAmount * 0.19);
    const totalAmount = netAmount + (vatAmount || 0);
    const issueDate =
      body.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate)
        ? body.issueDate
        : new Date().toISOString().slice(0, 10);
    const documentType =
      body.documentType && ["invoice", "credit_note", "debit_note"].includes(body.documentType)
        ? body.documentType
        : "invoice";

    const maxFolio = await db
      .select({ max: sql<number>`COALESCE(MAX(${empresasDteDocuments.folio}), 0)` })
      .from(empresasDteDocuments)
      .where(
        and(
          eq(empresasDteDocuments.companyId, companyId),
          eq(empresasDteDocuments.direction, "issued"),
        ),
      );
    const nextFolio = (Number(maxFolio[0]?.max) || 0) + 1;

    const [inserted] = await db
      .insert(empresasDteDocuments)
      .values({
        companyId,
        documentType,
        direction: "issued",
        folio: nextFolio,
        emitterRut: company.rut,
        emitterName: company.name,
        receiverRut,
        receiverName: (body.receiverName && String(body.receiverName).trim()) || null,
        issueDate,
        netAmount,
        vatAmount: vatAmount || null,
        totalAmount,
        currency: "CLP",
        status: "valid",
      })
      .returning({ id: empresasDteDocuments.id, folio: empresasDteDocuments.folio });
    res
      .status(201)
      .json({ data: { id: inserted?.id, folio: inserted?.folio, message: "DTE emitido" } });
  } catch (error) {
    next(error);
  }
});

// ========== PURCHASE ORDERS (OC) ==========
router.get("/purchase-orders", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyIdParam = req.query.company_id;
    if (!companyIdParam || typeof companyIdParam !== "string") {
      res.status(400).json({ error: "company_id query parameter is required" });
      return;
    }
    const companyId = parseInt(companyIdParam, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const result = await db
      .select()
      .from(empresasPurchaseOrders)
      .where(eq(empresasPurchaseOrders.companyId, companyId))
      .orderBy(sql`${empresasPurchaseOrders.createdAt} DESC`);
    res.json({ data: result, count: result.length });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/purchase-orders/by-vendor",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyIdParam = req.query.company_id;
      if (!companyIdParam || typeof companyIdParam !== "string") {
        res.status(400).json({ error: "company_id query parameter is required" });
        return;
      }
      const companyId = parseInt(companyIdParam, 10);
      if (isNaN(companyId)) {
        res.status(400).json({ error: "Invalid company_id" });
        return;
      }
      if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
      const list = await db
        .select()
        .from(empresasPurchaseOrders)
        .where(eq(empresasPurchaseOrders.companyId, companyId))
        .orderBy(empresasPurchaseOrders.customerRut, sql`${empresasPurchaseOrders.createdAt} DESC`);
      const byVendor = new Map<string, typeof list>();
      for (const po of list) {
        const key = `${(po as { customerRut: string }).customerRut}|${(po as { customerName: string | null }).customerName ?? ""}`;
        if (!byVendor.has(key)) byVendor.set(key, []);
        byVendor.get(key)!.push(po);
      }
      const vendors = Array.from(byVendor.entries()).map(([key, orders]) => {
        const first = orders[0] as { customerRut: string; customerName: string | null };
        return {
          vendorRut: first.customerRut,
          vendorName: first.customerName ?? first.customerRut,
          orders,
          totalAmount: orders.reduce(
            (s: number, o: (typeof list)[number]) =>
              s + Number((o as { totalAmount: number }).totalAmount),
            0,
          ),
        };
      });
      res.json({ data: vendors, count: vendors.length });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/purchase-orders/:id/link-dte",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const poId = parseInt(req.params.id, 10);
      const body = req.body as { dteDocumentId: number };
      if (isNaN(poId) || !body?.dteDocumentId) {
        res.status(400).json({ error: "id and dteDocumentId are required" });
        return;
      }
      const dteId = Number(body.dteDocumentId);
      const poRows = await db
        .select()
        .from(empresasPurchaseOrders)
        .where(eq(empresasPurchaseOrders.id, poId));
      if (poRows.length === 0) {
        res.status(404).json({ error: "Purchase order not found" });
        return;
      }
      const po = poRows[0] as { companyId: number };
      if (!(await requireMembership(req as AuthenticatedRequest, res, po.companyId))) return;
      const dteRows = await db
        .select()
        .from(empresasDteDocuments)
        .where(eq(empresasDteDocuments.id, dteId));
      if (
        dteRows.length === 0 ||
        (dteRows[0] as { companyId: number }).companyId !== po.companyId
      ) {
        res.status(404).json({ error: "DTE not found or does not belong to this company" });
        return;
      }
      const dte = dteRows[0] as { totalAmount: number; direction: string };
      if (dte.direction !== "received") {
        res.status(400).json({ error: "Only received DTEs can be linked to a purchase order" });
        return;
      }
      const totalAmount = Number(dte.totalAmount);
      await db
        .update(empresasPurchaseOrders)
        .set({
          dteDocumentId: dteId,
          invoicedAmount: totalAmount,
          status:
            totalAmount >= Number((poRows[0] as { totalAmount: number }).totalAmount)
              ? "fully_invoiced"
              : "partially_invoiced",
        } as any)
        .where(eq(empresasPurchaseOrders.id, poId));
      res.json({ data: { message: "OC vinculada al DTE", dteDocumentId: dteId } });
    } catch (error) {
      next(error);
    }
  },
);

// ========== CASH FORECAST (Asistente flujo de caja) ==========
router.get(
  "/cash-forecast/:company_id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseInt(req.params.company_id, 10);
      if (isNaN(companyId)) {
        res.status(400).json({ error: "Invalid company_id" });
        return;
      }
      if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
      const daysParam = req.query.days;
      const daysAhead = daysParam ? Math.min(parseInt(String(daysParam), 10) || 30, 90) : 30;

      const accountsResult = await db
        .select()
        .from(empresasBankAccounts)
        .where(eq(empresasBankAccounts.companyId, companyId));
      const latestBalances = await Promise.all(
        accountsResult.map(async (acc: (typeof accountsResult)[number]) => {
          const bal = await db
            .select()
            .from(empresasBankBalances)
            .where(eq(empresasBankBalances.bankAccountId, acc.id))
            .orderBy(sql`${empresasBankBalances.balanceDate} DESC`)
            .limit(1);
          return {
            accountId: acc.id,
            balance: bal[0]?.currentBalance ?? bal[0]?.availableBalance ?? 0,
          };
        }),
      );
      const currentBalance = latestBalances.reduce(
        (s: number, b: { accountId: number; balance: number }) => s + b.balance,
        0,
      );

      const txns = await db
        .select({
          id: empresasBankTransactions.id,
          transactionDate: empresasBankTransactions.transactionDate,
          amount: empresasBankTransactions.amount,
        })
        .from(empresasBankTransactions)
        .where(eq(empresasBankTransactions.companyId, companyId));
      const historicalTransactions = txns.map((t: (typeof txns)[number]) => ({
        id: t.id,
        transactionDate: t.transactionDate,
        amount: t.amount,
        transactionType: t.amount >= 0 ? "inflow" : "outflow",
      }));

      const { generateCashForecast } = await import("./empresas/core-finance/cash/cashService.js");
      const forecasts = generateCashForecast(currentBalance, historicalTransactions, daysAhead);

      res.json({
        data: {
          companyId,
          currentBalance,
          currency: "CLP",
          daysAhead,
          forecast: forecasts,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ========== SEED DEMO (empresa demo para login) ==========
router.post("/seed-demo", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // #G: per-usuario. Antes, "ya existen empresas" miraba TODAS; ahora solo las del usuario,
    // y el creador recibe membresía 'owner' para que solo él vea su empresa demo.
    const myIds = await listMemberCompanyIds(req as AuthenticatedRequest);
    if (myIds.length > 0) {
      return res.json({
        data: { message: "Ya tienes una empresa demo.", count: myIds.length },
      });
    }
    const today = new Date().toISOString().slice(0, 10);
    const [c1] = await db
      .insert(empresasCompanies)
      .values({
        name: "Empresa Demo CODA SpA",
        rut: "76.111.222-3",
        industry: "Servicios",
      })
      .returning({ id: empresasCompanies.id });
    if (!c1?.id) {
      return res.status(500).json({ error: "No se pudo crear la empresa demo" });
    }
    const companyId = c1.id;
    // El creador queda como dueño (multi-tenancy, #G).
    await grantMembership(req as AuthenticatedRequest, companyId, "owner");
    const demoAccounts: {
      accountNumber: string;
      accountType: "checking" | "savings" | "credit";
      balance: number;
      txns?: { amount: number; description: string; category: string }[];
    }[] = [
      {
        accountNumber: "10000001",
        accountType: "checking",
        balance: 7_000_000,
        txns: [
          { amount: 1_500_000, description: "Venta cliente", category: "ingreso" },
          { amount: -400_000, description: "Pago proveedor", category: "gasto" },
        ],
      },
      { accountNumber: "10000002", accountType: "savings", balance: 2_000_000 },
      {
        accountNumber: "CC-DEMO",
        accountType: "credit",
        balance: -300_000,
        txns: [{ amount: -300_000, description: "Compras", category: "gasto" }],
      },
    ];
    for (const ac of demoAccounts) {
      const [acc] = await db
        .insert(empresasBankAccounts)
        .values({
          companyId,
          bankName: "Banco Demo",
          accountNumber: ac.accountNumber,
          accountType: ac.accountType,
          currency: "CLP",
          isActive: 1,
        })
        .returning({ id: empresasBankAccounts.id });
      if (acc?.id) {
        await db.insert(empresasBankBalances).values({
          bankAccountId: acc.id,
          balanceDate: today,
          availableBalance: ac.balance,
          currentBalance: ac.balance,
        });
        for (const t of ac.txns ?? []) {
          await db.insert(empresasBankTransactions).values({
            companyId,
            bankAccountId: acc.id,
            transactionDate: today,
            postedDate: today,
            amount: t.amount,
            currency: "CLP",
            description: t.description,
            category: t.category,
            status: "posted",
          });
        }
      }
    }
    await db.insert(empresasRiskScores).values({
      companyId,
      assessmentDate: today,
      overallScore: 75,
      rating: "B",
      factors: JSON.stringify({ liquidity: 0.8, solvency: 0.7 }),
    });
    res.json({
      data: { message: "Empresa demo creada.", companyId },
    });
  } catch (error) {
    next(error);
  }
});

// ========== CONNECTIONS ==========
const openBankingConnector = createMockOpenBankingConnector();
const siiConnector = createMockSIIConnector();
const purchaseOrdersConnector = createMockPurchaseOrdersConnector();

router.get("/connections/:company_id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = parseInt(req.params.company_id, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "Invalid company_id" });
      return;
    }
    if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
    const accounts = await db
      .select({ lastSyncAt: empresasBankAccounts.lastSyncAt })
      .from(empresasBankAccounts)
      .where(eq(empresasBankAccounts.companyId, companyId))
      .limit(1);
    const dteCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(empresasDteDocuments)
      .where(eq(empresasDteDocuments.companyId, companyId));
    const poCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(empresasPurchaseOrders)
      .where(eq(empresasPurchaseOrders.companyId, companyId));
    const transactionCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(empresasBankTransactions)
      .where(eq(empresasBankTransactions.companyId, companyId));
    res.json({
      data: [
        {
          id: "openbanking",
          name: "Open Banking",
          description: "Conexión con bancos",
          connected: (transactionCount[0]?.count ?? 0) > 0,
          lastSyncAt: accounts[0]?.lastSyncAt ?? null,
          syncAction: "sync",
          stats: { accounts: accounts.length, transactions: transactionCount[0]?.count ?? 0 },
        },
        {
          id: "sii",
          name: "SII DTE",
          description: "Documentos tributarios",
          connected: (dteCount[0]?.count ?? 0) > 0,
          lastSyncAt: (dteCount[0]?.count ?? 0) > 0 ? new Date().toISOString() : null,
          syncAction: "sync",
          stats: { documents: dteCount[0]?.count ?? 0 },
        },
        {
          id: "purchase_orders",
          name: "Órdenes de Compra",
          description: "Órdenes de compra",
          connected: (poCount[0]?.count ?? 0) > 0,
          lastSyncAt: (poCount[0]?.count ?? 0) > 0 ? new Date().toISOString() : null,
          syncAction: "upload",
          stats: { orders: poCount[0]?.count ?? 0 },
        },
      ],
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/connections/:company_id/:type/sync",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseInt(req.params.company_id, 10);
      const connectionType = req.params.type;
      if (isNaN(companyId)) {
        res.status(400).json({ error: "Invalid company_id" });
        return;
      }
      if (!(await requireMembership(req as AuthenticatedRequest, res, companyId))) return;
      const validTypes = ["openbanking", "sii", "purchase_orders"];
      if (!validTypes.includes(connectionType)) {
        res.status(400).json({ error: `Invalid type. Valid: ${validTypes.join(", ")}` });
        return;
      }
      const syncedAt = new Date().toISOString();
      if (connectionType === "openbanking") {
        const syncResult = await openBankingConnector.syncFull(companyId);
        if (!syncResult.success) {
          res.status(500).json({ error: "Sync failed", errors: syncResult.errors });
          return;
        }
        const obData = syncResult.data[0];
        if (!obData) {
          res.status(500).json({ error: "No data from sync" });
          return;
        }
        for (const account of obData.accounts) {
          await db
            .insert(empresasBankAccounts)
            .values({
              companyId,
              bankName: account.bankName,
              accountNumber: account.accountNumber,
              accountType: account.accountType,
              currency: account.currency,
              isActive: account.isActive ? 1 : 0,
              lastSyncAt: syncedAt,
              syncCursor: syncResult.cursor,
            })
            .onConflictDoNothing();
        }
        const accountsInDb = await db
          .select()
          .from(empresasBankAccounts)
          .where(eq(empresasBankAccounts.companyId, companyId));
        const accountMap = new Map<string, number>();
        for (const acc of accountsInDb) accountMap.set(acc.accountNumber, acc.id);
        let insertedTxns = 0;
        for (const txn of obData.transactions) {
          const matchingAccount = obData.accounts.find(
            (a: { externalId?: string; accountNumber: string }) =>
              a.externalId === txn.accountExternalId,
          );
          const accountNumber = matchingAccount?.accountNumber;
          const bankAccountId = accountNumber ? accountMap.get(accountNumber) : null;
          if (!bankAccountId) continue;
          try {
            await db
              .insert(empresasBankTransactions)
              .values({
                companyId,
                bankAccountId,
                externalId: txn.externalId,
                transactionDate: txn.transactionDate,
                postedDate: txn.postedDate,
                amount: txn.amount,
                currency: txn.currency,
                description: txn.description,
                counterpartyName: txn.counterpartyName,
                counterpartyRut: txn.counterpartyRut,
                reference: txn.reference,
                status: txn.status,
                category: txn.category,
              })
              .onConflictDoNothing();
            insertedTxns++;
          } catch (_) {}
        }
        for (const bal of obData.balances) {
          const matchingAccount = obData.accounts.find(
            (a: { externalId?: string; accountNumber: string }) =>
              a.externalId === bal.accountExternalId,
          );
          const bankAccountId = matchingAccount
            ? accountMap.get(matchingAccount.accountNumber)
            : null;
          if (!bankAccountId) continue;
          try {
            await db
              .insert(empresasBankBalances)
              .values({
                bankAccountId,
                balanceDate: bal.balanceDate,
                availableBalance: bal.availableBalance,
                currentBalance: bal.currentBalance,
              })
              .onConflictDoNothing();
          } catch (_) {}
        }
        res.json({
          data: {
            success: true,
            inserted: insertedTxns,
            message: `Sincronizados ${insertedTxns} transacciones`,
          },
        });
      } else if (connectionType === "sii") {
        const syncResult = await siiConnector.syncFull(companyId);
        if (!syncResult.success) {
          res.status(500).json({ error: "Sync failed", errors: syncResult.errors });
          return;
        }
        let inserted = 0;
        for (const doc of syncResult.data) {
          try {
            await db
              .insert(empresasDteDocuments)
              .values({
                companyId,
                documentType: doc.documentType,
                direction: doc.direction,
                folio: doc.folio,
                emitterRut: doc.emitterRut,
                emitterName: doc.emitterName,
                receiverRut: doc.receiverRut,
                receiverName: doc.receiverName,
                issueDate: doc.issueDate,
                netAmount: doc.netAmount,
                vatAmount: doc.vatAmount ?? 0,
                totalAmount: doc.totalAmount,
                currency: doc.currency,
                status: doc.status,
                references: doc.references,
              })
              .onConflictDoNothing();
            inserted++;
          } catch (_) {}
        }
        res.json({
          data: { success: true, inserted, message: `Sincronizados ${inserted} documentos DTE` },
        });
      } else if (connectionType === "purchase_orders") {
        const syncResult = await purchaseOrdersConnector.syncFull(companyId);
        if (!syncResult.success) {
          res.status(500).json({ error: "Sync failed", errors: syncResult.errors });
          return;
        }
        let inserted = 0;
        for (const po of syncResult.data) {
          try {
            await db
              .insert(empresasPurchaseOrders)
              .values({
                companyId,
                poNumber: po.poNumber,
                customerRut: po.customerRut,
                customerName: po.customerName,
                currency: po.currency,
                totalAmount: po.totalAmount,
                invoicedAmount: po.invoicedAmount ?? 0,
                expectedInvoiceDate: po.expectedInvoiceDate,
                status: po.status,
                notes: po.notes,
              })
              .onConflictDoNothing();
            inserted++;
          } catch (_) {}
        }
        res.json({
          data: { success: true, inserted, message: `Sincronizadas ${inserted} órdenes de compra` },
        });
      } else {
        res.status(400).json({ error: "Unknown connection type" });
      }
    } catch (error) {
      next(error);
    }
  },
);

export function registerEmpresasRoutes(app: express.Express): void {
  app.use("/api/empresas", router);
}
