import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertBankConnectionSchema, 
  insertFinancialGoalSchema
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { auth } from "express-oauth2-jwt-bearer";

// Auth0 JWT middleware
const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: "RS256"
});

// Helper to get user ID from Auth0 sub claim
function getUserIdFromAuth(req: Request): string {
  // @ts-ignore
  return req.auth?.payload?.sub;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Error handling middleware
  const handleZodError = (err: any, req: Request, res: Response, next: Function) => {
    if (err instanceof ZodError) {
      const validationError = fromZodError(err);
      return res.status(400).json({ 
        message: "Validation error", 
        errors: validationError.details 
      });
    }
    next(err);
  };

  app.use("/api", handleZodError);

  // --- Protected routes (require Auth0 JWT) ---

  // Bank connection routes
  app.get("/api/bank-connections", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req); // userId is string
      const connections = await storage.getBankConnections(userId as any); // <-- FIX: allow string
      res.json(connections);
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/bank-connections", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const connectionData = insertBankConnectionSchema.parse({
        ...req.body,
        userId
      });
      const connection = await storage.createBankConnection(connectionData);
      res.status(201).json(connection);
    } catch (error) {
      throw error;
    }
  });

  app.put("/api/bank-connections/:id", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const connectionId = Number(req.params.id);
      const connection = await storage.getBankConnection(connectionId);
      if (!connection || String(connection.userId) !== userId) {
        return res.status(404).json({ message: "Bank connection not found" });
      }
      const updatedConnection = await storage.updateBankConnection(
        connectionId, 
        req.body
      );
      res.json(updatedConnection);
    } catch (error) {
      throw error;
    }
  });

  app.delete("/api/bank-connections/:id", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const connectionId = Number(req.params.id);
      const connection = await storage.getBankConnection(connectionId);
      if (!connection || String(connection.userId) !== userId) {
        return res.status(404).json({ message: "Bank connection not found" });
      }
      await storage.deleteBankConnection(connectionId);
      res.json({ message: "Bank connection deleted" });
    } catch (error) {
      throw error;
    }
  });

  // Financial goals routes
  app.get("/api/financial-goals", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req); // userId is string
      const goals = await storage.getFinancialGoals(userId as any); // <-- FIX: allow string
      res.json(goals);
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/financial-goals", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const goalData = insertFinancialGoalSchema.parse({
        ...req.body,
        userId
      });
      const goal = await storage.createFinancialGoal(goalData);
      res.status(201).json(goal);
    } catch (error) {
      throw error;
    }
  });

  app.put("/api/financial-goals/:id", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const goalId = Number(req.params.id);
      const goal = await storage.getFinancialGoal(goalId);
      if (!goal || String(goal.userId) !== userId) {
        return res.status(404).json({ message: "Financial goal not found" });
      }
      const updatedGoal = await storage.updateFinancialGoal(
        goalId, 
        req.body
      );
      res.json(updatedGoal);
    } catch (error) {
      throw error;
    }
  });

  app.delete("/api/financial-goals/:id", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const goalId = Number(req.params.id);
      const goal = await storage.getFinancialGoal(goalId);
      if (!goal || String(goal.userId) !== userId) {
        return res.status(404).json({ message: "Financial goal not found" });
      }
      await storage.deleteFinancialGoal(goalId);
      res.json({ message: "Financial goal deleted" });
    } catch (error) {
      throw error;
    }
  });

  // --- Public/demo routes (no auth required) ---

  // Credit score routes (demo)
  app.get("/api/credit-score", async (req, res) => {
    try {
      // For demo purposes, use a fixed user ID
      const userId = 1;
      let creditScore = await storage.getCreditScore(userId);
      if (!creditScore) {
        const calculatedScore = calculateCreditScore([]);
        creditScore = await storage.createCreditScore({
          userId,
          ...calculatedScore
        });
      }
      res.json(creditScore);
    } catch (error) {
      throw error;
    }
  });

  // Insurance risk routes (demo)
  app.get("/api/insurance-risk", async (req, res) => {
    try {
      const userId = 1;
      let insuranceRisk = await storage.getInsuranceRisk(userId);
      if (!insuranceRisk) {
        const user = await storage.getUser(userId);
        if (!user) {
          const defaultUser = {
            id: 1,
            username: "demo",
            email: "demo@example.com",
            firstName: "Demo",
            lastName: "User",
            password: "password"
          };
          const calculatedRisk = calculateInsuranceRisk([], defaultUser);
          insuranceRisk = await storage.createInsuranceRisk({
            userId,
            ...calculatedRisk
          });
        } else {
          const calculatedRisk = calculateInsuranceRisk([], user);
          insuranceRisk = await storage.createInsuranceRisk({
            userId,
            ...calculatedRisk
          });
        }
      }
      res.json(insuranceRisk);
    } catch (error) {
      throw error;
    }
  });

  // Financial products routes (public)
  app.get("/api/financial-products", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const products = await storage.getFinancialProducts(category);
      res.json(products ?? []);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/financial-products/:id", async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const product = await storage.getFinancialProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Financial product not found" });
      }
      res.json(product);
    } catch (error) {
      throw error;
    }
  });

  // Utility endpoints (public)
  app.post("/api/utils/credit-score", (req, res) => {
    const { bankData } = req.body;
    if (!bankData || !Array.isArray(bankData) || bankData.length === 0) {
      return res.status(400).json({ message: "Valid bank data is required" });
    }
    const score = calculateCreditScore(bankData);
    res.json(score);
  });

  app.post("/api/utils/insurance-risk", (req, res) => {
    const { bankData, userProfile } = req.body;
    if (!bankData || !Array.isArray(bankData) || bankData.length === 0) {
      return res.status(400).json({ message: "Valid bank data is required" });
    }
    if (!userProfile) {
      return res.status(400).json({ message: "User profile is required" });
    }
    const risk = calculateInsuranceRisk(bankData, userProfile);
    res.json(risk);
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Utility functions for backend calculations
function calculateCreditScore(bankConnections: any[]) {
  const score = Math.floor(Math.random() * (800 - 650)) + 650;
  let paymentHistory = "Good";
  let utilization = "Average";
  let ageOfCredit = "Good";
  if (score >= 750) {
    paymentHistory = "Excellent";
    utilization = score > 780 ? "Excellent" : "Good";
  } else if (score >= 700) {
    paymentHistory = "Good";
    utilization = "Average";
  } else {
    paymentHistory = "Average";
    utilization = "Poor";
  }
  return {
    score,
    maxScore: 850,
    paymentHistory,
    utilization,
    ageOfCredit
  };
}

function calculateInsuranceRisk(bankConnections: any[], userProfile: any) {
  const riskScores = ["Low", "Medium", "High"];
  const healthRisk = riskScores[Math.floor(Math.random() * 3)];
  const propertyRisk = riskScores[Math.floor(Math.random() * 3)];
  const autoRisk = riskScores[Math.floor(Math.random() * 3)];
  let riskLevel = "Medium";
  const riskCount: Record<string, number> = {
    Low: 0,
    Medium: 0,
    High: 0
  };
  riskCount[healthRisk]++;
  riskCount[propertyRisk]++;
  riskCount[autoRisk]++;
  if (riskCount.High >= 2) {
    riskLevel = "High";
  } else if (riskCount.Low >= 2) {
    riskLevel = "Low";
  }
  return {
    riskLevel,
    healthRisk,
    propertyRisk,
    autoRisk
  };
}