import { useAuth0 } from "@auth0/auth0-react";

export function useApi() {
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();

  const apiRequest = async (
    method: string,
    url: string,
    data?: unknown,
    options?: RequestInit
  ) => {
    // If not authenticated, redirect to login
    if (!isAuthenticated) {
      await loginWithRedirect();
      throw new Error("User not authenticated");
    }

    let token = "";
    try {
      token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://finhealth-api"
        }
      });
    } catch (err) {
      console.error("Error getting access token:", err);
      await loginWithRedirect();
      throw new Error("Could not get access token");
    }

    let extraHeaders: Record<string, string> = {};
    if (
      options?.headers &&
      typeof options.headers === "object" &&
      !(options.headers instanceof Headers) &&
      !Array.isArray(options.headers)
    ) {
      extraHeaders = options.headers as Record<string, string>;
    }

    const headers: Record<string, string> = {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
      Authorization: `Bearer ${token}`,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      // Don't throw for 401 errors, let React Query handle them
      if (res.status === 401) {
        throw new Error("Unauthorized");
      }
      throw new Error(error.message || "API request failed");
    }

    return res;
  };

  // Example: get bank connections
  const getBankConnections = async () => {
    const res = await apiRequest("GET", "/api/bank-connections");
    return res.json();
  };

  // Example: connect a bank
  const connectBank = async (bankData: any) => {
    const res = await apiRequest("POST", "/api/bank-connections", bankData);
    return res.json();
  };

  // Example: get financial goals
  const getFinancialGoals = async () => {
    const res = await apiRequest("GET", "/api/financial-goals");
    return res.json();
  };

  // Example: create a financial goal
  const createFinancialGoal = async (goalData: any) => {
    const res = await apiRequest("POST", "/api/financial-goals", goalData);
    return res.json();
  };

  // Example: update a financial goal
  const updateFinancialGoal = async (goalId: string, goalData: any) => {
    const res = await apiRequest("PUT", `/api/financial-goals/${goalId}`, goalData);
    return res.json();
  };

  // Example: delete a financial goal
  const deleteFinancialGoal = async (goalId: string) => {
    const res = await apiRequest("DELETE", `/api/financial-goals/${goalId}`);
    return res.json();
  };

  // Example: get credit score
  const getCreditScore = async () => {
    const res = await apiRequest("GET", "/api/credit-score");
    return res.json();
  };

  // Example: get insurance risk
  const getInsuranceRisk = async () => {
    const res = await apiRequest("GET", "/api/insurance-risk");
    return res.json();
  };

  // Example: get financial products
  const getFinancialProducts = async (category?: string) => {
    const url = category
      ? `/api/financial-products?category=${encodeURIComponent(category)}`
      : "/api/financial-products";
    const res = await apiRequest("GET", url);
    return res.json();
  };

  // Expenses API functions
  const getExpenses = async () => {
    const res = await apiRequest("GET", "/api/expenses");
    return res.json();
  };

  const createExpense = async (expenseData: any) => {
    const res = await apiRequest("POST", "/api/expenses", expenseData);
    return res.json();
  };

  const updateExpense = async (expenseId: string, expenseData: any) => {
    const res = await apiRequest("PUT", `/api/expenses/${expenseId}`, expenseData);
    return res.json();
  };

  const deleteExpense = async (expenseId: string) => {
    const res = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
    return res.json();
  };

  // Bill Split API functions
  const getBillSplits = async () => {
    const res = await apiRequest("GET", "/api/bill-splits");
    return res.json();
  };

  const createBillSplit = async (billSplitData: any) => {
    const res = await apiRequest("POST", "/api/bill-splits", billSplitData);
    return res.json();
  };

  const updateBillSplit = async (billSplitId: string, billSplitData: any) => {
    const res = await apiRequest("PUT", `/api/bill-splits/${billSplitId}`, billSplitData);
    return res.json();
  };

  const deleteBillSplit = async (billSplitId: string) => {
    const res = await apiRequest("DELETE", `/api/bill-splits/${billSplitId}`);
    return res.json();
  };

  const updateBillSplitParticipant = async (billSplitId: string, participantId: string, participantData: any) => {
    const res = await apiRequest("PUT", `/api/bill-splits/${billSplitId}/participants/${participantId}`, participantData);
    return res.json();
  };

  // Profile API functions
  const updateProfile = async (profileData: any) => {
    const res = await apiRequest("PUT", "/api/profile", profileData);
    return res.json();
  };

  const getUserProfile = async () => {
    const res = await apiRequest("GET", "/api/profile");
    return res.json();
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
    getInsuranceRisk,
    getFinancialProducts,
    // Expenses
    getExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    // Bill Splits
    getBillSplits,
    createBillSplit,
    updateBillSplit,
    deleteBillSplit,
    updateBillSplitParticipant,
    // Profile
    updateProfile,
    getUserProfile,
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

export const useInsuranceRisk = () => {
  const { getInsuranceRisk } = useApi();
  const refreshInsuranceRisk = async () => {
    // In a real implementation, this might refresh cached data
    return await getInsuranceRisk();
  };
  return { getInsuranceRisk, refreshInsuranceRisk };
};

export const useFinancialGoals = () => {
  const { getFinancialGoals, createFinancialGoal, updateFinancialGoal, deleteFinancialGoal } = useApi();
  return { getFinancialGoals, createFinancialGoal, updateFinancialGoal, deleteFinancialGoal };
};