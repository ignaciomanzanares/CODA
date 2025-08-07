import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "./queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

interface RegisterData {
  username: string;
  password: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    // Check for token in localStorage on app initialization
    const savedToken = localStorage.getItem("auth_token");
    const savedUser = localStorage.getItem("auth_user");
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("POST", "/api/auth/login", { username, password });
      const data = await response.json();
      
      setUser(data.user);
      setToken(data.token);
      
      // Save in localStorage
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.user.username}!`,
      });
      
      navigate("/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Please check your credentials and try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("POST", "/api/auth/register", userData);
      const data = await response.json();
      
      setUser(data.user);
      setToken(data.token);
      
      // Save in localStorage
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      
      toast({
        title: "Registration successful",
        description: "Your account has been created.",
      });
      
      navigate("/");
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Please check your details and try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      
      if (token) {
        // Call logout endpoint
        await apiRequest("POST", "/api/auth/logout", {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      // Clear state and localStorage
      setUser(null);
      setToken(null);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear the local state even if the API call fails
      setUser(null);
      setToken(null);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Individual bank connection functions for direct import
export async function connectBank(bankData: any) {
  const response = await apiRequest("POST", "/api/bank-connections", bankData);
  return response.json();
}

export async function getBankConnections() {
  const response = await apiRequest("GET", "/api/bank-connections");
  return response.json();
}

// Bank connections hook
export function useBankConnections() {
  const connectBankWithAuth = async (bankData: any) => {
    const response = await apiRequest("POST", "/api/bank-connections", bankData);
    
    return response.json();
  };
  
  const getBankConnectionsWithAuth = async () => {
    const response = await apiRequest("GET", "/api/bank-connections");
    
    return response.json();
  };
  
  return { 
    connectBank: connectBankWithAuth, 
    getBankConnections: getBankConnectionsWithAuth 
  };
}

// Credit score hook
export function useCreditScore() {
  const getCreditScore = async () => {
    const response = await apiRequest("GET", "/api/credit-score");
    
    return response.json();
  };
  
  const refreshCreditScore = async () => {
    const response = await apiRequest("POST", "/api/credit-score/refresh");
    
    return response.json();
  };
  
  return { getCreditScore, refreshCreditScore };
}

// Insurance risk hook
export function useInsuranceRisk() {
  const getInsuranceRisk = async () => {
    const response = await apiRequest("GET", "/api/insurance-risk");
    
    return response.json();
  };
  
  const refreshInsuranceRisk = async () => {
    const response = await apiRequest("POST", "/api/insurance-risk/refresh");
    
    return response.json();
  };
  
  return { getInsuranceRisk, refreshInsuranceRisk };
}

// Individual financial goal functions for direct import
export async function getFinancialGoals() {
  const response = await apiRequest("GET", "/api/financial-goals");
  return response.json();
}

export async function createFinancialGoal(goalData: any) {
  const response = await apiRequest("POST", "/api/financial-goals", goalData);
  return response.json();
}

export async function updateFinancialGoal(goalId: number, goalData: any) {
  const response = await apiRequest("PUT", `/api/financial-goals/${goalId}`, goalData);
  return response.json();
}

export async function deleteFinancialGoal(goalId: number) {
  const response = await apiRequest("DELETE", `/api/financial-goals/${goalId}`);
  return response.json();
}

// Financial goals hook
export function useFinancialGoals() {
  const getFinancialGoalsWithAuth = async () => {
    const response = await apiRequest("GET", "/api/financial-goals");
    
    return response.json();
  };
  
  const createFinancialGoalWithAuth = async (goalData: any) => {
    const response = await apiRequest("POST", "/api/financial-goals", goalData);
    
    return response.json();
  };
  
  const updateFinancialGoalWithAuth = async (goalId: number, goalData: any) => {
    const response = await apiRequest("PUT", `/api/financial-goals/${goalId}`, goalData);
    
    return response.json();
  };
  
  const deleteFinancialGoalWithAuth = async (goalId: number) => {
    const response = await apiRequest("DELETE", `/api/financial-goals/${goalId}`);
    
    return response.json();
  };
  
  return {
    getFinancialGoals: getFinancialGoalsWithAuth,
    createFinancialGoal: createFinancialGoalWithAuth,
    updateFinancialGoal: updateFinancialGoalWithAuth,
    deleteFinancialGoal: deleteFinancialGoalWithAuth
  };
}

// Financial products
export async function getFinancialProducts(category?: string) {
  const url = category ? `/api/financial-products?category=${category}` : '/api/financial-products';
  
  const response = await apiRequest("GET", url);
  return response.json();
}

export async function getFinancialProduct(productId: number) {
  const response = await apiRequest("GET", `/api/financial-products/${productId}`);
  return response.json();
}
