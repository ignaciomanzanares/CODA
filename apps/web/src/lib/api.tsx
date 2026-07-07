import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/apiBase";
import { dispatchSessionExpired } from "@/lib/authEvents";
import { USER_FACING_CONNECTION_ERROR, extractApiErrorMessage } from "@/lib/userFacingErrors";
import type {
  CreateBankConnectionData,
  CreateGoalData,
  UpdateGoalData,
  CreateExpenseData,
  UpdateExpenseData,
  CreateBillSplitData,
  UpdateBillSplitData,
  UpdateBillSplitParticipantData,
  ProfileData
} from "@/types";

/** Prefill devuelto por POST /api/assets/extract-inscripcion. */
export interface AssetInscripcionPrefill {
  type: "property";
  name: string;
  acquisitionCostClp: number | null;
  estimatedValueClp: number | null;
  hasLien: boolean;
  lienAmountClp: number | null;
  notes: string;
  fxPending: boolean;
}
export interface ExtractInscripcionResponse {
  ok: boolean;
  usedOcr?: boolean;
  manualFallback?: boolean;
  message?: string;
  prefill?: AssetInscripcionPrefill;
  /** Presente cuando el OCR corre async (escaneado): hay que hacer polling al job. */
  jobId?: string;
  status?: 'processing' | 'done' | 'error';
}
/** Respuesta del polling GET /api/assets/extract-inscripcion/:jobId. */
export interface InscripcionJobResponse {
  status: 'processing' | 'done' | 'error';
  result?: ExtractInscripcionResponse;
  message?: string;
}

export type ApiClient = {
  apiRequest: <T = unknown>(method: string, url: string, data?: unknown, options?: RequestInit) => Promise<T>;
  extractInscripcion: (file: File) => Promise<ExtractInscripcionResponse>;
  getInscripcionJob: (jobId: string) => Promise<InscripcionJobResponse>;
  getBankConnections: () => Promise<import("@/types").BankConnection[]>;
  connectBank: (bankData: import("@/types").CreateBankConnectionData) => Promise<import("@/types").BankConnection>;
  getFinancialGoals: () => Promise<any[]>;
  createFinancialGoal: (goalData: import("@/types").CreateGoalData) => Promise<import("@/types").Goal>;
  updateFinancialGoal: (goalId: string, goalData: import("@/types").UpdateGoalData) => Promise<import("@/types").Goal>;
  deleteFinancialGoal: (goalId: string) => Promise<import("@/types").ApiResponse>;
  getCreditScore: () => Promise<{
    available?: boolean;
    reason?: string | null;
    score: number | null;
    maxScore: number;
    paymentHistory: string;
    utilization: string;
    ageOfCredit: string;
    lastUpdated?: string | null;
    message?: string;
  }>;
  getFinancialProducts: (category?: string) => Promise<import("@/types").FinancialProduct[]>;
  getProductRecommendations: (category?: string, limit?: number) => Promise<any[]>;
  trackProductEvent: (productId: number, eventType: 'view' | 'click' | 'application', matchScore?: number, metadata?: Record<string, unknown>) => Promise<{ success: boolean }>;
  applyToProduct: (productId: number, applicationData: { requestedAmount?: number; term?: number; purpose?: string; additionalInfo?: Record<string, unknown> }) => Promise<{ success: boolean; applicationId: number; message: string; estimatedProcessingDays: number }>;
  getUserApplications: () => Promise<any[]>;
  getProductMetrics: () => Promise<any>;
  getExpenses: () => Promise<import("@/types").Expense[]>;
  createExpense: (expenseData: import("@/types").CreateExpenseData) => Promise<import("@/types").Expense>;
  updateExpense: (expenseId: string, expenseData: import("@/types").UpdateExpenseData) => Promise<import("@/types").Expense>;
  deleteExpense: (expenseId: string) => Promise<import("@/types").ApiResponse>;
  classifyExpense: (description: string, merchantName?: string, amount?: number) => Promise<{category: string; subcategory?: string; confidence: number}>;
  scanExpense: (imageFile: File) => Promise<{ amount: number; merchant: string; category: string; confidence: number }>;
  getBillSplits: () => Promise<any[]>;
  createBillSplit: (billSplitData: import("@/types").CreateBillSplitData) => Promise<import("@/types").BillSplit>;
  updateBillSplit: (billSplitId: string, billSplitData: import("@/types").UpdateBillSplitData) => Promise<import("@/types").BillSplit>;
  deleteBillSplit: (billSplitId: string) => Promise<import("@/types").ApiResponse>;
  updateBillSplitParticipant: (billSplitId: string, participantId: string, participantData: import("@/types").UpdateBillSplitParticipantData) => Promise<import("@/types").BillSplitParticipant>;
  markParticipantAsPaid: (billSplitId: string, participantId: string, amountPaid?: number) => Promise<import("@/types").ApiResponse>;
  archiveBillSplit: (billSplitId: string) => Promise<import("@/types").ApiResponse>;
  updateProfile: (profileData: import("@/types").ProfileData) => Promise<any>;
  getUserProfile: () => Promise<any>;
  deleteAccount: () => Promise<any>;
  changePassword: () => Promise<import("@/types").ApiResponse>;
  getMFAStatus: () => Promise<{ enrolled: boolean; methods: string[] }>;
  enableTwoFactor: () => Promise<{ success?: boolean; message?: string }>;
  disableTwoFactor: () => Promise<{ success?: boolean; message?: string }>;
  getNotifications: (options?: { category?: string; unreadOnly?: boolean; limit?: number; offset?: number }) => Promise<any[]>;
  markNotificationAsRead: (notificationId: number) => Promise<import("@/types").ApiResponse>;
  markAllNotificationsAsRead: () => Promise<import("@/types").ApiResponse>;
  deleteNotification: (notificationId: number) => Promise<import("@/types").ApiResponse>;
  getUnreadNotificationCount: () => Promise<number>;
  getConsents: () => Promise<import("@/types").ConsentGrant[]>;
  revokeConsent: (grantId: number) => Promise<import("@/types").ConsentGrant>;
  getPrivacyConsents: () => Promise<import("@/types").PrivacyConsentPanelResponse>;
  acceptPrivacyPurpose: (purpose: import("@/types").PrivacyPurposeKey) => Promise<import("@/types").PrivacyConsentPanelResponse>;
  revokePrivacyPurpose: (purpose: import("@/types").PrivacyPurposeKey) => Promise<import("@/types").PrivacyConsentPanelResponse>;
  simulateBankFlow: () => Promise<import("@/types").SimulateBankFlowResponse>;
  uploadDocument: (file: File) => Promise<import("@/types").DocumentUploadResult>;
  getTransactionalScore: () => Promise<{
    transactionalScore: number | null;
    mainInsights: string[];
    metrics?: { averageMonthlyBalanceClp?: number; monthsWithAbonos?: number; monthsWithGap?: number; overdraftUsageRatio?: number; hasOptimizationOpportunity?: boolean };
    recommendedProducts?: string[];
  }>;
  parseNotifications: (notifications: string[]) => Promise<any>;
};

export function useApi(): ApiClient {
  const [location] = useLocation();
  const context = location.startsWith("/empresas") ? "empresas" : "personal";
  const { token, isAuthenticated } = useAuth(context);

  // Local response shapes used by the UI components
  type CreditScore = {
    available?: boolean;
    reason?: string | null;
    score: number | null;
    maxScore: number;
    paymentHistory: string;
    utilization: string;
    ageOfCredit: string;
    lastUpdated?: string | null;
    message?: string;
  };

  type Notification = {
    id: number;
    title?: string;
    body?: string;
    isRead?: boolean;
    category?: string;
    createdAt?: string;
    [key: string]: any;
  };

  const apiRequest = async <T = unknown>(
    method: string,
    url: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<T> => {
    // Personal usa cookie auth. Empresas conserva su Bearer legacy.
    if (!isAuthenticated) {
      throw new Error("User not authenticated");
    }

    // No propagar `headers`/`body`/`method` en el spread final.
    const { headers: optsHeaders, body: optsBody, method: _ignoredMethod, ...restOptions } = options ?? {};

    let extraHeaders: Record<string, string> = {};
    if (
      optsHeaders &&
      typeof optsHeaders === "object" &&
      !(optsHeaders instanceof Headers) &&
      !Array.isArray(optsHeaders)
    ) {
      extraHeaders = optsHeaders as Record<string, string>;
    }

    const headers: Record<string, string> = {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
      ...(context === "empresas" && token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // Prepend API_BASE_URL if url starts with '/api'
    const fullUrl = url.startsWith("/api") ? `${API_BASE_URL}${url.replace(/^\/api/, "")}` : url;

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        ...restOptions,
        method,
        headers,
        credentials: "include",
        body: data !== undefined ? JSON.stringify(data) : optsBody,
        // Evita caché HTTP/304 en listas (p. ej. metas con ETag): sin cuerpo JSON el refetch no actualiza React Query.
        cache: method === "GET" ? "no-store" : restOptions?.cache,
      });
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(USER_FACING_CONNECTION_ERROR);
      }
      throw e;
    }

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      let errorBody: unknown = {};
      if (contentType.includes("application/json")) {
        errorBody = await res.json().catch(() => ({}));
      } else {
        const t = await res.text().catch(() => "");
        if (t.trim().startsWith("{")) {
          try {
            errorBody = JSON.parse(t);
          } catch {
            errorBody = { message: t };
          }
        } else {
          errorBody = { message: t };
        }
      }
      const msg = extractApiErrorMessage(errorBody);
      if (res.status === 401) {
        dispatchSessionExpired(fullUrl);
        // No exponer el mensaje técnico del backend ("Missing or invalid
        // authorization header"); el usuario solo necesita saber que re-loguee.
        throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      }
      throw new Error(msg || `Error ${res.status}`);
    }

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    if (contentType.includes("application/json")) {
      const body = (await res.json()) as unknown;
      return body as T;
    }

    // Fallback to text
    const text = await res.text();
    return (text as unknown) as T;
  };

  // Example: get bank connections
  const getBankConnections = async (): Promise<import("@/types").BankConnection[]> => {
    return await apiRequest<import("@/types").BankConnection[]>("GET", "/api/bank-connections");
  };

  // Example: connect a bank
  const connectBank = async (bankData: CreateBankConnectionData): Promise<import("@/types").BankConnection> => {
    return await apiRequest<import("@/types").BankConnection>("POST", "/api/bank-connections", bankData);
  };

  // Example: get financial goals
  const getFinancialGoals = async (): Promise<(import("@/types").Goal & { status: string })[]> => {
    return await apiRequest<(import("@/types").Goal & { status: string })[]>("GET", "/api/financial-goals");
  };

  // Example: create a financial goal
  const createFinancialGoal = async (goalData: CreateGoalData): Promise<import("@/types").Goal> => {
    return await apiRequest<import("@/types").Goal>("POST", "/api/financial-goals", goalData);
  };

  // Example: update a financial goal
  const updateFinancialGoal = async (goalId: string, goalData: UpdateGoalData): Promise<import("@/types").Goal> => {
    return await apiRequest<import("@/types").Goal>("PUT", `/api/financial-goals/${goalId}`, goalData);
  };

  // Example: delete a financial goal
  const deleteFinancialGoal = async (goalId: string): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("DELETE", `/api/financial-goals/${goalId}`);
  };

  // Example: get credit score
  const getCreditScore = async (): Promise<CreditScore> => {
    return await apiRequest<CreditScore>("GET", "/api/credit-score");
  };

  // Example: get financial products (public endpoint)
  const getFinancialProducts = async (category?: string): Promise<import("@/types").FinancialProduct[]> => {
    const url = category
      ? `${API_BASE_URL}/financial-products?category=${encodeURIComponent(category)}`
      : `${API_BASE_URL}/financial-products`;
    // Financial products is a public endpoint, don't require auth
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) {
      throw new Error("Failed to fetch financial products");
    }
    return (await res.json()) as import("@/types").FinancialProduct[];
  };

  // Get personalized product recommendations
  const getProductRecommendations = async (category?: string, limit?: number): Promise<any[]> => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (limit) params.append('limit', limit.toString());
    const url = `/api/products/recommendations${params.toString() ? `?${params.toString()}` : ''}`;
    return await apiRequest<any[]>("GET", url);
  };

  // Track product interaction (view, click, application)
  const trackProductEvent = async (
    productId: number,
    eventType: 'view' | 'click' | 'application',
    matchScore?: number,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean }> => {
    return await apiRequest<{ success: boolean }>("POST", "/api/products/track", {
      productId,
      eventType,
      matchScore,
      metadata
    });
  };

  // Apply to a financial product
  const applyToProduct = async (
    productId: number,
    applicationData: {
      requestedAmount?: number;
      term?: number;
      purpose?: string;
      additionalInfo?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; applicationId: number; message: string; estimatedProcessingDays: number }> => {
    return await apiRequest("POST", "/api/products/apply", {
      productId,
      ...applicationData
    });
  };

  // Get user's product applications
  const getUserApplications = async (): Promise<any[]> => {
    return await apiRequest<any[]>("GET", "/api/products/applications");
  };

  // Get product performance metrics (admin)
  const getProductMetrics = async (): Promise<any> => {
    return await apiRequest<any>("GET", "/api/products/metrics");
  };

  // Expenses API functions
  const getExpenses = async (): Promise<import("@/types").Expense[]> => {
    return await apiRequest<import("@/types").Expense[]>("GET", "/api/expenses");
  };

  const createExpense = async (expenseData: CreateExpenseData): Promise<import("@/types").Expense> => {
    return await apiRequest<import("@/types").Expense>("POST", "/api/expenses", expenseData);
  };

  const updateExpense = async (expenseId: string, expenseData: UpdateExpenseData): Promise<import("@/types").Expense> => {
    return await apiRequest<import("@/types").Expense>("PUT", `/api/expenses/${expenseId}`, expenseData);
  };

  const deleteExpense = async (expenseId: string): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("DELETE", `/api/expenses/${expenseId}`);
  };

  const classifyExpense = async (description: string, merchantName?: string, amount?: number): Promise<{category: string; subcategory?: string; confidence: number}> => {
    return await apiRequest<{category: string; subcategory?: string; confidence: number}>("POST", "/api/expenses/classify", {
      description,
      merchantName,
      amount
    });
  };

  const scanExpense = async (imageFile: File): Promise<{ amount: number; merchant: string; category: string; confidence: number }> => {
    if (!isAuthenticated) throw new Error("User not authenticated");
    const formData = new FormData();
    formData.append("image", imageFile);
    const fullUrl = `${API_BASE_URL}/expenses/scan`;
    const res = await fetch(fullUrl, {
      method: "POST",
      credentials: "include",
      headers: context === "empresas" && token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { message?: string }).message || "Error al escanear la imagen");
    return json as { amount: number; merchant: string; category: string; confidence: number };
  };

  // Bill Split API functions (cache: no-store para que el saldo se actualice siempre, sin 304)
  const getBillSplits = async (): Promise<(import("@/types").BillSplit & { participants?: import("@/types").BillSplitParticipant[] })[]> => {
    return await apiRequest<(import("@/types").BillSplit & { participants?: import("@/types").BillSplitParticipant[] })[]>("GET", "/api/bill-splits", undefined, { cache: "no-store" });
  };

  const createBillSplit = async (billSplitData: CreateBillSplitData): Promise<import("@/types").BillSplit> => {
    return await apiRequest<import("@/types").BillSplit>("POST", "/api/bill-splits", billSplitData);
  };

  const updateBillSplit = async (billSplitId: string, billSplitData: UpdateBillSplitData): Promise<import("@/types").BillSplit> => {
    return await apiRequest<import("@/types").BillSplit>("PUT", `/api/bill-splits/${billSplitId}`, billSplitData);
  };

  const deleteBillSplit = async (billSplitId: string): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("DELETE", `/api/bill-splits/${billSplitId}`);
  };

  const updateBillSplitParticipant = async (billSplitId: string, participantId: string, participantData: UpdateBillSplitParticipantData): Promise<import("@/types").BillSplitParticipant> => {
    return await apiRequest<import("@/types").BillSplitParticipant>("PUT", `/api/bill-splits/${billSplitId}/participants/${participantId}`, participantData);
  };

  const markParticipantAsPaid = async (billSplitId: string, participantId: string, amountPaid?: number): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("POST", `/api/bill-splits/${billSplitId}/participants/${participantId}/pay`, { amountPaid });
  };

  const archiveBillSplit = async (billSplitId: string): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("POST", `/api/bill-splits/${billSplitId}/archive`);
  };

  // Profile API functions
  const updateProfile = async (profileData: ProfileData): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("PUT", "/api/profile", profileData);
  };

  const getUserProfile = async (): Promise<import("@/types").User> => {
    return await apiRequest<import("@/types").User>("GET", "/api/profile");
  };

  // User management API functions
  const deleteAccount = async (): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("DELETE", "/api/profile/account");
  };

  const changePassword = async (): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("POST", "/api/profile/change-password");
  };

  const getMFAStatus = async (): Promise<{ enrolled: boolean; methods: string[] }> => {
    return await apiRequest<{ enrolled: boolean; methods: string[] }>("GET", "/api/profile/mfa-status");
  };

  const enableTwoFactor = async (): Promise<{ success?: boolean; message?: string }> => {
    return await apiRequest<{ success?: boolean; message?: string }>("POST", "/api/auth/2fa/enable");
  };

  const disableTwoFactor = async (): Promise<{ success?: boolean; message?: string }> => {
    return await apiRequest<{ success?: boolean; message?: string }>("POST", "/api/auth/2fa/disable");
  };

  // Notification API functions
  const getNotifications = async (options?: { 
    category?: string; 
    unreadOnly?: boolean; 
    limit?: number; 
    offset?: number; 
  }) => {
    const params = new URLSearchParams();
    if (options?.category) params.append('category', options.category);
    if (options?.unreadOnly) params.append('unreadOnly', 'true');
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    
    const url = `/api/notifications${params.toString() ? `?${params.toString()}` : ''}`;
    return await apiRequest<Notification[]>("GET", url);
  };

  const markNotificationAsRead = async (notificationId: number): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("PUT", `/api/notifications/${notificationId}/read`);
  };

  const markAllNotificationsAsRead = async (): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("PUT", "/api/notifications/read-all");
  };

  const deleteNotification = async (notificationId: number): Promise<import("@/types").ApiResponse> => {
    return await apiRequest<import("@/types").ApiResponse>("DELETE", `/api/notifications/${notificationId}`);
  };

  const getUnreadNotificationCount = async (): Promise<number> => {
    return await apiRequest<number>("GET", "/api/notifications/unread-count");
  };

  const getConsents = async (): Promise<import("@/types").ConsentGrant[]> => {
    return await apiRequest<import("@/types").ConsentGrant[]>("GET", "/api/consent");
  };

  const revokeConsent = async (grantId: number): Promise<import("@/types").ConsentGrant> => {
    return await apiRequest<import("@/types").ConsentGrant>("POST", `/api/consent/${grantId}/revoke`);
  };

  const getPrivacyConsents = async (): Promise<import("@/types").PrivacyConsentPanelResponse> => {
    return await apiRequest<import("@/types").PrivacyConsentPanelResponse>("GET", "/api/privacy-consents");
  };

  const acceptPrivacyPurpose = async (
    purpose: import("@/types").PrivacyPurposeKey
  ): Promise<import("@/types").PrivacyConsentPanelResponse> => {
    return await apiRequest<import("@/types").PrivacyConsentPanelResponse>("POST", "/api/privacy-consents/accept", {
      purpose,
    });
  };

  const revokePrivacyPurpose = async (
    purpose: import("@/types").PrivacyPurposeKey
  ): Promise<import("@/types").PrivacyConsentPanelResponse> => {
    return await apiRequest<import("@/types").PrivacyConsentPanelResponse>("POST", "/api/privacy-consents/revoke", {
      purpose,
    });
  };

  const simulateBankFlow = async (): Promise<import("@/types").SimulateBankFlowResponse> => {
    return await apiRequest<import("@/types").SimulateBankFlowResponse>("POST", "/api/test/simulate-bank-flow");
  };

  const uploadDocument = async (file: File): Promise<import("@/types").DocumentUploadResult> => {
    if (!isAuthenticated) throw new Error("User not authenticated");
    const formData = new FormData();
    formData.append("document", file);
    const fullUrl = `${API_BASE_URL}/documents/upload`;
    const res = await fetch(fullUrl, {
      method: "POST",
      credentials: "include",
      headers: context === "empresas" && token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) dispatchSessionExpired(fullUrl);
      throw new Error((json as { message?: string }).message || "Error al subir el documento");
    }
    return json as import("@/types").DocumentUploadResult;
  };

  const extractInscripcion = async (file: File): Promise<ExtractInscripcionResponse> => {
    if (!isAuthenticated) throw new Error("User not authenticated");
    const formData = new FormData();
    formData.append("file", file);
    const fullUrl = `${API_BASE_URL}/assets/extract-inscripcion`;
    const res = await fetch(fullUrl, {
      method: "POST",
      credentials: "include",
      headers: context === "empresas" && token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) dispatchSessionExpired(fullUrl);
      throw new Error((json as { message?: string }).message || "Error al procesar la inscripción");
    }
    // 200 → prefill listo (capa de texto). 202 → { jobId, status:'processing' }:
    // el OCR corre async y el caller hace polling con getInscripcionJob.
    return json as ExtractInscripcionResponse;
  };

  const getInscripcionJob = async (jobId: string): Promise<InscripcionJobResponse> => {
    return await apiRequest<InscripcionJobResponse>(
      "GET",
      `/api/assets/extract-inscripcion/${encodeURIComponent(jobId)}`,
    );
  };

  const getTransactionalScore = async () => {
    return await apiRequest<{
      transactionalScore: number | null;
      mainInsights: string[];
      metrics?: { averageMonthlyBalanceClp?: number; monthsWithAbonos?: number; monthsWithGap?: number; overdraftUsageRatio?: number; hasOptimizationOpportunity?: boolean };
      recommendedProducts?: string[];
    }>("GET", "/api/transactional-score");
  };

  const parseNotifications = async (notifications: string[]): Promise<{
    results: Array<{
      original: string;
      parsed: {
        amount: number;
        merchant: string;
        date: string;
        cardType: string;
        bank: string;
        category: string;
        sfaCode: string;
        confidence: number;
      } | null;
      error?: string;
    }>;
  }> => {
    return await apiRequest("POST", "/api/expenses/parse-notification", { notifications });
  };

  return {
    apiRequest,
    getBankConnections,
    connectBank,
    getFinancialGoals,
    createFinancialGoal,
    updateFinancialGoal,
    deleteFinancialGoal,
    getCreditScore,
    getFinancialProducts,
    // Product recommendations & tracking
    getProductRecommendations,
    trackProductEvent,
    applyToProduct,
    getUserApplications,
    getProductMetrics,
    // Expenses
    getExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    classifyExpense,
    scanExpense,
    // Bill Splits
    getBillSplits,
    createBillSplit,
    updateBillSplit,
    deleteBillSplit,
    updateBillSplitParticipant,
    markParticipantAsPaid,
    archiveBillSplit,
    // Profile
    updateProfile,
    getUserProfile,
    // User Management
    deleteAccount,
    changePassword,
    getMFAStatus,
    enableTwoFactor,
    disableTwoFactor,
    // Notifications
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    getUnreadNotificationCount,
    getConsents,
    revokeConsent,
    getPrivacyConsents,
    acceptPrivacyPurpose,
    revokePrivacyPurpose,
    simulateBankFlow,
    uploadDocument,
    extractInscripcion,
    getInscripcionJob,
    getTransactionalScore,
    parseNotifications,
  };
}

// React hooks for data fetching (for compatibility with your imports)
export const useCreditScore = () => {
  const { getCreditScore } = useApi();
  const refreshCreditScore = async () => {
    // In a real implementation, this might refresh cached data
    return await getCreditScore();
  };
  return { getCreditScore, refreshCreditScore };
};

export const useFinancialGoals = () => {
  const { getFinancialGoals, createFinancialGoal, updateFinancialGoal, deleteFinancialGoal } = useApi();
  return { getFinancialGoals, createFinancialGoal, updateFinancialGoal, deleteFinancialGoal };
};
