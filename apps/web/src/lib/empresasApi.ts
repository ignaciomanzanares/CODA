/**
 * Cliente API para CODA Empresas (rutas /api/empresas)
 */
import { apiFetch } from "./apiFetch";

const EMPRESAS_PREFIX = "/api/empresas";

async function fetchEmpresas<T>(path: string, init?: RequestInit): Promise<{ data: T }> {
  const res = await apiFetch(`${EMPRESAS_PREFIX}${path}`, init);
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
  const res = await apiFetch(`${EMPRESAS_PREFIX}/reconciliation/${companyId}/run`, { method: "POST" });
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
  const res = await apiFetch(`${EMPRESAS_PREFIX}/connections/${companyId}/${type}/sync`, { method: "POST" });
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
