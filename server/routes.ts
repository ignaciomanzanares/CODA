import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertBankConnectionSchema, 
  insertCreditScoreSchema,
  insertInsuranceRiskSchema,
  insertFinancialGoalSchema
} from "@shared/schema";
import { calculateCreditScore } from "./utils/creditScore";
import { calculateInsuranceRisk } from "./utils/insuranceRisk";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// Simple session management
const sessions: Map<string, { userId: number }> = new Map();

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication middleware
  const authenticate = (req: Request, res: Response, next: Function) => {
    const sessionId = req.headers.authorization?.split(" ")[1];
    
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    req.body.session = sessions.get(sessionId);
    next();
  };
  
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
  
  // User routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }
      
      const user = await storage.createUser(userData);
      
      // Create a session
      const sessionId = Math.random().toString(36).substring(2, 15);
      sessions.set(sessionId, { userId: user.id });
      
      // Don't return password in response
      const { password, ...userWithoutPassword } = user;
      
      res.status(201).json({ 
        user: userWithoutPassword,
        token: sessionId 
      });
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      const user = await storage.getUserByUsername(username);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Create a session
      const sessionId = Math.random().toString(36).substring(2, 15);
      sessions.set(sessionId, { userId: user.id });
      
      // Don't return password in response
      const { password: _, ...userWithoutPassword } = user;
      
      res.json({ 
        user: userWithoutPassword,
        token: sessionId 
      });
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/auth/logout", authenticate, (req, res) => {
    const sessionId = req.headers.authorization?.split(" ")[1];
    
    if (sessionId) {
      sessions.delete(sessionId);
    }
    
    res.json({ message: "Logged out successfully" });
  });

  // Bank connection routes
  app.get("/api/bank-connections", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      const connections = await storage.getBankConnections(userId);
      res.json(connections);
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/bank-connections", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
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

  app.put("/api/bank-connections/:id", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      const connectionId = parseInt(req.params.id);
      
      // Verify connection belongs to user
      const connection = await storage.getBankConnection(connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Bank connection not found" });
      }
      
      // Update connection
      const updatedConnection = await storage.updateBankConnection(
        connectionId, 
        req.body
      );
      
      res.json(updatedConnection);
    } catch (error) {
      throw error;
    }
  });

  app.delete("/api/bank-connections/:id", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      const connectionId = parseInt(req.params.id);
      
      // Verify connection belongs to user
      const connection = await storage.getBankConnection(connectionId);
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Bank connection not found" });
      }
      
      await storage.deleteBankConnection(connectionId);
      res.json({ message: "Bank connection deleted" });
    } catch (error) {
      throw error;
    }
  });

  // Credit score routes
  app.get("/api/credit-score", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      let creditScore = await storage.getCreditScore(userId);
      
      // If no credit score exists, create one
      if (!creditScore) {
        // In a real app, we would calculate this based on bank connection data
        // For now, we'll use a function that generates a simulated credit score
        const bankConnections = await storage.getBankConnections(userId);
        if (bankConnections.length === 0) {
          return res.status(400).json({ 
            message: "No bank connections found. Please connect at least one bank account." 
          });
        }
        
        const calculatedScore = calculateCreditScore(bankConnections);
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

  app.post("/api/credit-score/refresh", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      
      // Get bank connections to calculate score
      const bankConnections = await storage.getBankConnections(userId);
      if (bankConnections.length === 0) {
        return res.status(400).json({ 
          message: "No bank connections found. Please connect at least one bank account." 
        });
      }
      
      // Calculate score from bank data
      const calculatedScore = calculateCreditScore(bankConnections);
      
      // Update or create credit score
      let creditScore = await storage.getCreditScore(userId);
      if (creditScore) {
        creditScore = await storage.updateCreditScore(userId, calculatedScore);
      } else {
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

  // Insurance risk routes
  app.get("/api/insurance-risk", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      let insuranceRisk = await storage.getInsuranceRisk(userId);
      
      // If no insurance risk exists, create one
      if (!insuranceRisk) {
        // In a real app, we would calculate this based on bank connection data and user profile
        // For now, we'll use a function that generates a simulated risk assessment
        const bankConnections = await storage.getBankConnections(userId);
        if (bankConnections.length === 0) {
          return res.status(400).json({ 
            message: "No bank connections found. Please connect at least one bank account." 
          });
        }
        
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        
        const calculatedRisk = calculateInsuranceRisk(bankConnections, user);
        insuranceRisk = await storage.createInsuranceRisk({
          userId,
          ...calculatedRisk
        });
      }
      
      res.json(insuranceRisk);
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/insurance-risk/refresh", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      
      // Get bank connections to calculate risk
      const bankConnections = await storage.getBankConnections(userId);
      if (bankConnections.length === 0) {
        return res.status(400).json({ 
          message: "No bank connections found. Please connect at least one bank account." 
        });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Calculate risk from bank data and user profile
      const calculatedRisk = calculateInsuranceRisk(bankConnections, user);
      
      // Update or create insurance risk
      let insuranceRisk = await storage.getInsuranceRisk(userId);
      if (insuranceRisk) {
        insuranceRisk = await storage.updateInsuranceRisk(userId, calculatedRisk);
      } else {
        insuranceRisk = await storage.createInsuranceRisk({
          userId,
          ...calculatedRisk
        });
      }
      
      res.json(insuranceRisk);
    } catch (error) {
      throw error;
    }
  });

  // Financial goals routes
  app.get("/api/financial-goals", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      const goals = await storage.getFinancialGoals(userId);
      res.json(goals);
    } catch (error) {
      throw error;
    }
  });

  app.post("/api/financial-goals", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
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

  app.put("/api/financial-goals/:id", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      const goalId = parseInt(req.params.id);
      
      // Verify goal belongs to user
      const goal = await storage.getFinancialGoal(goalId);
      if (!goal || goal.userId !== userId) {
        return res.status(404).json({ message: "Financial goal not found" });
      }
      
      // Update goal
      const updatedGoal = await storage.updateFinancialGoal(
        goalId, 
        req.body
      );
      
      res.json(updatedGoal);
    } catch (error) {
      throw error;
    }
  });

  app.delete("/api/financial-goals/:id", authenticate, async (req, res) => {
    try {
      const { userId } = req.body.session;
      const goalId = parseInt(req.params.id);
      
      // Verify goal belongs to user
      const goal = await storage.getFinancialGoal(goalId);
      if (!goal || goal.userId !== userId) {
        return res.status(404).json({ message: "Financial goal not found" });
      }
      
      await storage.deleteFinancialGoal(goalId);
      res.json({ message: "Financial goal deleted" });
    } catch (error) {
      throw error;
    }
  });

  // Financial products routes
  app.get("/api/financial-products", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const products = await storage.getFinancialProducts(category);
      res.json(products);
    } catch (error) {
      throw error;
    }
  });

  app.get("/api/financial-products/:id", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getFinancialProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Financial product not found" });
      }
      
      res.json(product);
    } catch (error) {
      throw error;
    }
  });

  // Create utility functions for credit scoring and insurance risk
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
// In a real app, these would be in separate files with more complex logic

function calculateCreditScore(bankConnections: any[]) {
  // This is a placeholder for a real credit score calculation algorithm
  // It would analyze transaction history, account balances, credit utilization, etc.
  
  // For demonstration, return a simulated credit score
  const score = Math.floor(Math.random() * (800 - 650)) + 650; // Random score between 650-800
  
  let paymentHistory = "Good";
  let utilization = "Average";
  let ageOfCredit = "Good";
  
  // Determine rating based on score range
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
  // This is a placeholder for a real insurance risk calculation algorithm
  // It would analyze transaction patterns, account stability, etc.
  
  // For demonstration, return a simulated risk assessment
  const riskScores = ["Low", "Medium", "High"];
  const healthRisk = riskScores[Math.floor(Math.random() * 3)];
  const propertyRisk = riskScores[Math.floor(Math.random() * 3)];
  const autoRisk = riskScores[Math.floor(Math.random() * 3)];
  
  // Determine overall risk level
  let riskLevel = "Medium";
  const riskCount = {
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
