/**
 * Cliente API para CODA Empresas (rutas /api/empresas)
 * Requiere JWT de sesión Empresas (`jwt_token_empresas` en localStorage).
 */
import { apiFetch } from "./apiFetch";

const EMPRESAS_PREFIX = "/api/empresas";
const TOKEN_KEY_EMPRESAS = "jwt_token_empresas";

/** Añade Authorization: Bearer al iniciar sesión en contexto Empresas. */
export function withEmpresasAuth(init?: RequestInit): RequestInit {
  const token =
    typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY_EMPRESAS) : null;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

async function fetchEmpresas<T>(path: string, init?: RequestInit): Promise<{ data: T }> {
  const res = await apiFetch(`${EMPRESAS_PREFIX}${path}`, withEmpresasAuth(init));
  return res as { data: T };
}

export interface EmpresasCompany {
  id: number;
  name: string;
  rut: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySummary {
  cashBalance: number;
  transactionCount: number;
  invoiceCount: number;
  riskRating: string | null;
  riskScore: number | null;
  lastSyncAt: string | null;
  accountsByType?: { checking: number; savings: number; credit: number };
}

export interface CompanyWithSummary extends EmpresasCompany {
  summary: CompanySummary;
}

export interface DashboardMetrics {
  companyId: number;
  companyName: string;
  period: string;
  revenue: number;
  expenses: number;
  grossProfit: number;
  ebitda: number;
  netMargin: number;
  cashBalance: number;
  transactionCount: number;
  invoiceCount: number;
  dataFreshness: Array<{ connector: string; lastSync: string | null; status: string; recordCount: number }>;
}

export interface BankTransaction {
  id: number;
  companyId: number;
  bankAccountId: number;
  transactionDate: string;
  amount: number;
  currency: string;
  description: string | null;
  counterpartyName: string | null;
  reference: string | null;
  status: string;
  createdAt: string;
  accountType?: string | null;
  accountNumber?: string | null;
}

export async function getEmpresasCompanies(): Promise<EmpresasCompany[]> {
  const r = await fetchEmpresas<EmpresasCompany[]>("/companies");
  return r.data;
}

export async function getEmpresasCompaniesWithSummary(): Promise<CompanyWithSummary[]> {
  const r = await fetchEmpresas<CompanyWithSummary[]>("/companies/summary");
  return r.data;
}

export async function getEmpresasCompany(id: number): Promise<EmpresasCompany> {
  const r = await fetchEmpresas<EmpresasCompany>(`/companies/${id}`);
  return r.data;
}

export async function getEmpresasDashboard(companyId: number): Promise<DashboardMetrics> {
  const r = await fetchEmpresas<DashboardMetrics>(`/dashboard/${companyId}`);
  return r.data;
}

export async function getEmpresasTransactions(companyId: number): Promise<BankTransaction[]> {
  const r = await fetchEmpresas<BankTransaction[]>(`/transactions?company_id=${companyId}`);
  return r.data;
}

export async function getEmpresasRisk(companyId: number): Promise<{
  rating: string;
  numericScore: number;
  lastCalculated: string;
  factors: Array<{ name: string; category: string; value: string; score: number; weight: number; status: string; explanation: string }>;
  redFlags: string[];
  recommendations: Array<{ product: string; maxAmount: number; suitability: string; description: string }>;
}> {
  const r = await fetchEmpresas<unknown>(`/risk/${companyId}`);
  return r.data as Awaited<ReturnType<typeof getEmpresasRisk>>;
}

export async function getEmpresasReconciliation(companyId: number) {
  const r = await fetchEmpresas<unknown>(`/reconciliation/${companyId}`);
  return r.data;
}

export async function runEmpresasReconciliation(companyId: number) {
  const res = await apiFetch(
    `${EMPRESAS_PREFIX}/reconciliation/${companyId}/run`,
    withEmpresasAuth({ method: "POST" })
  );
  return (res as { data: unknown }).data;
}

export async function getEmpresasStatements(companyId: number, period?: string) {
  const q = period ? `?period=${period}` : "";
  const r = await fetchEmpresas<unknown>(`/statements/${companyId}${q}`);
  return r.data;
}

export async function getEmpresasConnections(companyId: number) {
  const r = await fetchEmpresas<unknown>(`/connections/${companyId}`);
  return r.data;
}

export async function syncEmpresasConnection(companyId: number, type: string) {
  const res = await apiFetch(
    `${EMPRESAS_PREFIX}/connections/${companyId}/${type}/sync`,
    withEmpresasAuth({ method: "POST" })
  );
  return (res as { data: unknown }).data;
}

export interface DTEDocument {
  id: number;
  companyId: number;
  documentType: string;
  direction: string;
  folio: number;
  emitterRut: string;
  emitterName: string | null;
  receiverRut: string;
  receiverName: string | null;
  issueDate: string;
  netAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
}

export async function getEmpresasDocuments(companyId: number): Promise<DTEDocument[]> {
  const r = await fetchEmpresas<DTEDocument[]>(`/documents?company_id=${companyId}`);
  return r.data;
}

export interface CreateDTEBody {
  companyId: number;
  documentType?: "invoice" | "credit_note" | "debit_note";
  receiverRut: string;
  receiverName?: string;
  netAmount: number;
  vatAmount?: number;
  issueDate?: string;
}

export async function createEmpresasDocument(body: CreateDTEBody): Promise<{ id: number; folio: number; message: string }> {
  const res = await apiFetch(
    `${EMPRESAS_PREFIX}/documents`,
    withEmpresasAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return (res as { data: { id: number; folio: number; message: string } }).data;
}

export interface CashForecastDay {
  date: string;
  projectedBalance: number;
  expectedInflows: number;
  expectedOutflows: number;
  confidence: number;
}

export async function getEmpresasCashForecast(companyId: number, days?: number): Promise<{
  companyId: number;
  currentBalance: number;
  currency: string;
  daysAhead: number;
  forecast: CashForecastDay[];
}> {
  const q = days != null ? `?days=${days}` : "";
  const r = await fetchEmpresas<Awaited<ReturnType<typeof getEmpresasCashForecast>>>(`/cash-forecast/${companyId}${q}`);
  return r.data;
}

export interface PurchaseOrder {
  id: number;
  companyId: number;
  poNumber: string;
  customerRut: string;
  customerName: string | null;
  currency: string;
  totalAmount: number;
  invoicedAmount: number | null;
  expectedInvoiceDate: string | null;
  status: string | null;
  notes: string | null;
  dteDocumentId: number | null;
  createdAt: string;
}

export async function getEmpresasPurchaseOrders(companyId: number): Promise<PurchaseOrder[]> {
  const r = await fetchEmpresas<PurchaseOrder[]>(`/purchase-orders?company_id=${companyId}`);
  return r.data;
}

export interface PurchaseOrdersByVendor {
  vendorRut: string;
  vendorName: string;
  orders: PurchaseOrder[];
  totalAmount: number;
}

export async function getEmpresasPurchaseOrdersByVendor(companyId: number): Promise<PurchaseOrdersByVendor[]> {
  const r = await fetchEmpresas<PurchaseOrdersByVendor[]>(`/purchase-orders/by-vendor?company_id=${companyId}`);
  return r.data;
}

export async function linkPurchaseOrderToDte(poId: number, dteDocumentId: number): Promise<{ message: string }> {
  const res = await apiFetch(
    `${EMPRESAS_PREFIX}/purchase-orders/${poId}/link-dte`,
    withEmpresasAuth({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dteDocumentId }),
    })
  );
  return (res as { data: { message: string } }).data;
}
