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
import { Auth0ManagementService } from "./services/auth0Management.js";
import { emailService } from "./services/emailService.js";
import crypto from "crypto";
import { calculateCreditScore } from "./utils/creditScore";
import { calculateInsuranceRisk } from "./utils/insuranceRisk";
import { notificationService } from "./services/notificationService";

// Auth0 JWT middleware
const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: "RS256"
});

// Helper to get user ID from Auth0 sub claim
function getUserIdFromAuth(req: Request): string {
  // @ts-expect-error - Auth middleware types are not fully typed
  return req.auth?.payload?.sub;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Error handling middleware
  const handleZodError = (err: unknown, _req: Request, res: Response, next: (...args: unknown[]) => unknown) => {
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
      const connections = await storage.getBankConnections(userId);
      
      // Set appropriate caching headers with a stable ETag based on content
      const body = JSON.stringify(connections);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({
        'Cache-Control': 'private, max-age=30, must-revalidate',
        'ETag': etag,
      });

      // Handle conditional request
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }
      
      res.json(connections);
    } catch (error) {
      console.error('Error in bank connections:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/bank-connections", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const connectionData = insertBankConnectionSchema.parse({
      ...req.body,
      userId
    });
    const connection = await storage.createBankConnection(connectionData);
    res.status(201).json(connection);
  });

  app.put("/api/bank-connections/:id", checkJwt, async (req, res) => {
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
  });

  app.delete("/api/bank-connections/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const connectionId = Number(req.params.id);
    const connection = await storage.getBankConnection(connectionId);
    if (!connection || String(connection.userId) !== userId) {
      return res.status(404).json({ message: "Bank connection not found" });
    }
    await storage.deleteBankConnection(connectionId);
    res.json({ message: "Bank connection deleted" });
  });

  // Financial goals routes
  app.get("/api/financial-goals", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req); // userId is string
    const goals = await storage.getFinancialGoals(userId);

    const body = JSON.stringify(goals);
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    res.set({
      'Cache-Control': 'private, max-age=30, must-revalidate',
      'ETag': etag,
    });
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.json(goals);
  });

  app.post("/api/financial-goals", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const goalData = insertFinancialGoalSchema.parse({
      ...req.body,
      userId,
      targetDate: new Date(req.body.targetDate) // Convert string to Date
    });
    const goal = await storage.createFinancialGoal(goalData);
    res.status(201).json(goal);
  });

  app.put("/api/financial-goals/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const goalId = Number(req.params.id);
    const goal = await storage.getFinancialGoal(goalId);
    if (!goal || String(goal.userId) !== userId) {
      return res.status(404).json({ message: "Financial goal not found" });
    }
    const updateData = req.body.targetDate ? {
      ...req.body,
      targetDate: new Date(req.body.targetDate) // Convert string to Date if present
    } : req.body;
    const updatedGoal = await storage.updateFinancialGoal(goalId, updateData);
    
    // Check for goal milestone notifications
    if (updatedGoal && req.body.currentAmount !== undefined) {
      try {
        const progress = Math.round((updatedGoal.currentAmount / updatedGoal.targetAmount) * 100);
        
        // Notify on significant milestones (25%, 50%, 75%, 90%, 100%)
        const milestones = [25, 50, 75, 90, 100];
        const currentMilestone = milestones.find(m => 
          progress >= m && 
          (goal.currentAmount / goal.targetAmount * 100) < m
        );
        
        if (currentMilestone) {
          await notificationService.notifyGoalMilestone(
            userId,
            updatedGoal.name,
            currentMilestone,
            updatedGoal.id as number
          );
        }
      } catch (notificationError) {
        console.error('Error creating goal milestone notification:', notificationError);
      }
    }
    
    res.json(updatedGoal);
  });

  app.delete("/api/financial-goals/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const goalId = Number(req.params.id);
    const goal = await storage.getFinancialGoal(goalId);
    if (!goal || String(goal.userId) !== userId) {
      return res.status(404).json({ message: "Financial goal not found" });
    }
    await storage.deleteFinancialGoal(goalId);
    res.json({ message: "Financial goal deleted" });
  });

  // Notification routes
  app.get("/api/notifications", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { category, unreadOnly, limit, offset } = req.query;
      
      const options = {
        category: category as string | undefined,
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      };
      
      const notifications = await notificationService.getNotifications(userId, options);
      
      const body = JSON.stringify(notifications);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({
        'Cache-Control': 'private, max-age=10, must-revalidate',
        'ETag': etag,
      });
      
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }
      
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put("/api/notifications/:id/read", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const notificationId = Number(req.params.id);
      
      const success = await notificationService.markAsRead(notificationId, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put("/api/notifications/read-all", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      const success = await notificationService.markAllAsRead(userId);
      
      res.json({ 
        message: success ? "All notifications marked as read" : "No unread notifications found"
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete("/api/notifications/:id", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const notificationId = Number(req.params.id);
      
      const success = await notificationService.deleteNotification(notificationId, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      res.json({ message: "Notification deleted" });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get("/api/notifications/unread-count", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const count = await notificationService.getUnreadCount(userId);
      
      res.json({ count });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- Public/demo routes (no auth required) ---

  // Credit score routes (demo)
  app.get("/api/credit-score", async (req, res) => {
    // For demo purposes, use a fixed user ID
    const userId = "demo-user";
    
    // Ensure demo user exists
    let user = await storage.getUser(userId);
    if (!user) {
      user = await storage.createUser({
        username: "demo",
        email: "demo@example.com",
        firstName: "Demo",
        lastName: "User"
      });
    }
    
    let creditScore = await storage.getCreditScore(userId);
    if (!creditScore) {
      const calculatedScore = calculateCreditScore([]);
      creditScore = await storage.createCreditScore({
        userId,
        ...calculatedScore
      });
    }
    res.json(creditScore);
  });

  // Insurance risk routes (demo)
  app.get("/api/insurance-risk", async (req, res) => {
    const userId = "demo-user";
    let insuranceRisk = await storage.getInsuranceRisk(userId);
    if (!insuranceRisk) {
      const user = await storage.getUser(userId);
      if (!user) {
        const defaultUser = {
          id: "demo-user",
          username: "demo",
          email: "demo@example.com",
          firstName: "Demo" as string | null,
          lastName: "User" as string | null,
          createdAt: new Date() as Date | null
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
  });

  // Expenses routes
  app.get("/api/expenses", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenses = await storage.getExpenses(userId);

    const body = JSON.stringify(expenses);
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    res.set({
      'Cache-Control': 'private, max-age=30, must-revalidate',
      'ETag': etag,
    });
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.json(expenses);
  });

  app.post("/api/expenses", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenseData = {
      ...req.body,
      userId,
      // Convert date string to Date object if it's a string
      date: typeof req.body.date === 'string' ? new Date(req.body.date) : req.body.date
    };
    const expense = await storage.createExpense(expenseData);
    
    // Check for unusual spending patterns and create notification
    try {
      console.log(`🔔 Processing expense notification for user ${userId}, amount: $${expense.amount}, category: ${expense.category}`);
      
      // For testing: create a notification for any expense >= $50
      const currentAmount = parseFloat(expense.amount);
      if (currentAmount >= 50) {
        console.log(`🔔 Creating expense notification for $${currentAmount}`);
        await notificationService.createNotification({
          userId,
          title: 'New Expense Added',
          message: `You added a $${currentAmount.toFixed(2)} expense for ${expense.category}.`,
          type: 'info',
          category: 'expense',
          actionUrl: '/expenses',
          metadata: { expenseId: expense.id, amount: currentAmount, category: expense.category }
        });
        console.log(`✅ Expense notification created successfully`);
      }
      
      // Original logic for unusual spending (keep this too)
      const userExpenses = await storage.getExpenses(userId);
      const categoryExpenses = userExpenses.filter(e => 
        e.category === expense.category && 
        e.id !== expense.id && // Exclude current expense
        new Date(e.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      );
      
      if (categoryExpenses.length > 0) {
        const averageAmount = categoryExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0) / categoryExpenses.length;
        
        // Notify if this expense is 2x more than average in this category
        if (currentAmount >= averageAmount * 2 && currentAmount >= 100) { // Also require minimum $100
          console.log(`🔔 Creating unusual expense notification: $${currentAmount} vs avg $${averageAmount.toFixed(2)}`);
          await notificationService.notifyUnusualExpense(
            userId,
            currentAmount,
            expense.category,
            expense.id as number
          );
        }
      }
    } catch (notificationError) {
      console.error('❌ Error creating expense notification:', notificationError);
    }
    
    res.status(201).json(expense);
  });

  app.put("/api/expenses/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenseId = Number(req.params.id);
    const expense = await storage.getExpense(expenseId);
    if (!expense || String(expense.userId) !== userId) {
      return res.status(404).json({ message: "Expense not found" });
    }
    const updateData = {
      ...req.body,
      // Convert date string to Date object if it's a string
      ...(req.body.date && typeof req.body.date === 'string' && { date: new Date(req.body.date) })
    };
    const updatedExpense = await storage.updateExpense(expenseId, updateData);
    res.json(updatedExpense);
  });

  app.delete("/api/expenses/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const expenseId = Number(req.params.id);
    const expense = await storage.getExpense(expenseId);
    if (!expense || String(expense.userId) !== userId) {
      return res.status(404).json({ message: "Expense not found" });
    }
    await storage.deleteExpense(expenseId);
    res.json({ message: "Expense deleted" });
  });

  // Bill splits routes
  app.get("/api/bill-splits", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const userEmail = req.auth?.payload?.email;
      
      // Try multiple possible email fields from Auth0 JWT
      let possibleEmail = userEmail || 
                         req.auth?.payload?.[process.env.AUTH0_AUDIENCE + '/email'] ||
                         req.auth?.payload?.['https://finhealth-api/email'] ||
                         req.auth?.payload?.['email'] ||
                         req.auth?.payload?.['https://dev-klhap06xvhqbtvbi.us.auth0.com/email'];
      
      // If email is not in JWT, try to fetch from Auth0 userinfo endpoint
      if (!possibleEmail) {
        try {
          const response = await fetch(`${process.env.AUTH0_ISSUER_BASE_URL}userinfo`, {
            headers: {
              'Authorization': req.headers.authorization || ''
            }
          });
          
          if (response.ok) {
            const userInfo = await response.json();
            possibleEmail = userInfo.email;
          }
        } catch (error) {
          // Silently handle userinfo fetch errors
        }
      }
      
      // Ensure user exists in database (create if needed)
      let user = await storage.getUser(userId);
      if (!user && possibleEmail) {
        // Extract user info from Auth0 JWT token
        const userName = req.auth?.payload?.name || req.auth?.payload?.nickname || 'User';
        const [firstName, ...lastNameParts] = userName.split(' ');
        
        user = await storage.createUser({
          id: userId, // Use Auth0 ID directly
          username: req.auth?.payload?.nickname || userId,
          email: possibleEmail,
          firstName: firstName || 'User',
          lastName: lastNameParts.length > 0 ? lastNameParts.join(' ') : null
        });
      }
      
      // Link existing participant records to this user if they match by email
      if (possibleEmail) {
        const unlinkedParticipants = await storage.getUnlinkedParticipantsByEmail(possibleEmail);
        if (unlinkedParticipants && unlinkedParticipants.length > 0) {
          for (const participant of unlinkedParticipants) {
            await storage.updateBillSplitParticipant(participant.id, { userId: userId });
          }
        }
      }
      
      // Get bill splits where user is the creator
      const createdBillSplits = await storage.getBillSplits(userId);
      
      // Get bill splits where user is a participant
      const participantBillSplits = await storage.getBillSplitsAsParticipant(userId);
      
      // Combine and deduplicate (in case user is both creator and participant)
      const allBillSplits = [...createdBillSplits];
      for (const participantSplit of participantBillSplits) {
        if (!createdBillSplits.some(cs => cs.id === participantSplit.id)) {
          allBillSplits.push(participantSplit);
        }
      }
      
      // Fetch participants for each bill split and add user role info
      const billSplitsWithParticipants = await Promise.all(
        allBillSplits.map(async (billSplit) => {
          const participants = await storage.getBillSplitParticipants(billSplit.id as number);
          const isCreator = String(billSplit.createdBy) === userId;
          const isParticipant = participants.some(p => String(p.userId) === userId);
          
          // Mark which participant is the current user
          const participantsWithCurrentUser = participants.map(p => ({
            ...p,
            isCurrentUser: String(p.userId) === userId
          }));
          
          return {
            ...billSplit,
            participants: participantsWithCurrentUser,
            userRole: isCreator ? 'creator' : (isParticipant ? 'participant' : 'none')
          };
        })
      );
      
      res.json(billSplitsWithParticipants);
    } catch (error) {
      console.error('Error fetching bill splits:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/bill-splits", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      // Ensure user exists in database (create if needed)
      let user = await storage.getUser(userId);
      if (!user) {
        // Extract user info from Auth0 JWT token
        const userEmail = req.auth?.payload?.email || `${userId}@unknown.com`;
        const userName = req.auth?.payload?.name || req.auth?.payload?.nickname || 'User';
        const [firstName, ...lastNameParts] = userName.split(' ');
        
        user = await storage.createUser({
          id: userId, // Use Auth0 ID directly
          username: req.auth?.payload?.nickname || userId,
          email: userEmail,
          firstName: firstName || 'User',
          lastName: lastNameParts.length > 0 ? lastNameParts.join(' ') : null
        });
        console.log(`✅ Created new user: ${userId} (${userEmail})`);
      }
      
      // Extract participants from request body (don't include in bill split data)
      const { participants, ...billSplitFields } = req.body;
      
      const billSplitData = {
        ...billSplitFields,
        createdBy: userId,
        // Ensure date is a proper Date object
        date: req.body.date ? new Date(req.body.date) : new Date()
      };
      const billSplit = await storage.createBillSplit(billSplitData);
      
      // Create notification for bill split creation
      try {
        console.log(`🔔 Creating bill split notification for user ${userId}, title: ${billSplit.title}, amount: $${billSplit.totalAmount}`);
        await notificationService.notifyBillSplitCreated(
          userId, 
          billSplit.title || 'New Bill Split', 
          parseFloat(billSplit.totalAmount),
          billSplit.id as number
        );
        console.log(`✅ Bill split notification created successfully`);
      } catch (notificationError) {
        console.error('❌ Error creating bill split notification:', notificationError);
      }
      
      // Create participants if provided and send email invitations
      if (participants && Array.isArray(participants)) {
        const creatorName = user ? 
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username :
          req.auth?.payload?.name || req.auth?.payload?.nickname || 'Someone';
        
        for (const participant of participants) {
          let participantUserId = null;
          
          // Check if user exists by email
          if (participant.email) {
            const existingUser = await storage.getUserByEmail(participant.email);
            if (existingUser) {
              participantUserId = existingUser.id;
            }
          }
          
          const newParticipant = await storage.createBillSplitParticipant({
            billSplitId: billSplit.id as number,
            name: participant.name || 'Unknown',
            email: participant.email || null,
            userId: participantUserId,
            amountOwed: participant.amount || (billSplit.totalAmount as number / participants.length).toString()
          });
          
          // Send email invitation if email is provided
          if (participant.email && newParticipant) {
            try {
              const emailResult = await emailService.sendBillSplitInvitation({
                billSplit: billSplit,
                participantName: participant.name,
                participantEmail: participant.email,
                amountOwed: newParticipant.amountOwed,
                creatorName: creatorName
              });
              
              const emailSent = !!emailResult;
              if (emailSent) {
                console.log(`Email invitation sent to ${participant.email}`);
              }
            } catch (emailError) {
              console.error('Error sending email invitation:', emailError);
            }
          }
        }
      }
      
      res.status(201).json(billSplit);
    } catch (error) {
      console.error('Error creating bill split:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put("/api/bill-splits/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const billSplitId = Number(req.params.id);
    const billSplit = await storage.getBillSplit(billSplitId);
    if (!billSplit || String(billSplit.createdBy) !== userId) {
      return res.status(404).json({ message: "Bill split not found" });
    }
    const updateData = {
      ...req.body,
      // Convert date string to Date object if date is provided
      ...(req.body.date && { date: new Date(req.body.date) })
    };
    const updatedBillSplit = await storage.updateBillSplit(billSplitId, updateData);
    res.json(updatedBillSplit);
  });

  app.delete("/api/bill-splits/:id", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const billSplitId = Number(req.params.id);
    const billSplit = await storage.getBillSplit(billSplitId);
    if (!billSplit || String(billSplit.createdBy) !== userId) {
      return res.status(404).json({ message: "Bill split not found" });
    }
    await storage.deleteBillSplit(billSplitId);
    res.json({ message: "Bill split deleted" });
  });

  app.put("/api/bill-splits/:id/participants/:participantId", checkJwt, async (req, res) => {
    const userId = getUserIdFromAuth(req);
    const billSplitId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    const billSplit = await storage.getBillSplit(billSplitId);
    if (!billSplit || String(billSplit.createdBy) !== userId) {
      return res.status(404).json({ message: "Bill split not found" });
    }
    const updatedParticipant = await storage.updateBillSplitParticipant(participantId, req.body);
    res.json(updatedParticipant);
  });

  // Mark participant as paid
  app.post("/api/bill-splits/:id/participants/:participantId/pay", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const participantId = Number(req.params.participantId);
      
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      // Check if user is either the bill creator OR the participant being marked as paid
      const participants = await storage.getBillSplitParticipants(billSplitId);
      const targetParticipant = participants.find(p => p.id === participantId);
      
      if (!targetParticipant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      const isCreator = String(billSplit.createdBy) === userId;
      const isTargetParticipant = String(targetParticipant.userId) === userId;
      
      if (!isCreator && !isTargetParticipant) {
        return res.status(403).json({ message: "Not authorized to mark this participant as paid" });
      }
      
      const participant = await storage.updateBillSplitParticipant(participantId, {
        isPaid: true,
        amountPaid: req.body.amountPaid || req.body.amountOwed
      });
      
      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      // Notify bill creator about payment
      if (String(billSplit.createdBy) !== userId) { // Only notify if payer is not the creator
        try {
          const payerUser = await storage.getUser(userId);
          const payerName = payerUser ? 
            `${payerUser.firstName || ''} ${payerUser.lastName || ''}`.trim() || payerUser.username :
            'Someone';
          
          await notificationService.createNotification({
            userId: String(billSplit.createdBy),
            title: 'Payment Received',
            message: `${payerName} has paid their share for "${billSplit.title}".`,
            type: 'success',
            category: 'bill_split',
            actionUrl: '/bill-split',
            metadata: { billSplitId, participantId, paidAmount: participant.amountPaid }
          });
        } catch (notificationError) {
          console.error('Error creating payment notification:', notificationError);
        }
      }
      
      res.json({ message: "Payment marked successfully", participant });
    } catch (error) {
      console.error('Error marking payment:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Archive/Complete a bill split
  app.post("/api/bill-splits/:id/archive", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      const updatedBillSplit = await storage.updateBillSplit(billSplitId, {
        status: "settled"
      });
      
      res.json({ message: "Bill split archived successfully", billSplit: updatedBillSplit });
    } catch (error) {
      console.error('Error archiving bill split:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Send invitations for a bill split
  app.post("/api/bill-splits/:id/invite", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const { participants } = req.body; // Array of { name, email } objects
      
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      
      // Get creator user info for email
      const creatorUser = await storage.getUser(userId);
      const creatorName = creatorUser ? 
        `${creatorUser.firstName || ''} ${creatorUser.lastName || ''}`.trim() || creatorUser.username :
        req.auth?.payload?.name || req.auth?.payload?.nickname || 'Someone';
      
      const inviteResults = [];
      
      for (const participant of participants) {
        let participantUserId = null;
        let emailSent = false;
        
        // Check if user exists by email
        if (participant.email) {
          const existingUser = await storage.getUserByEmail(participant.email);
          if (existingUser) {
            participantUserId = existingUser.id;
          }
        }
        
        // Create participant record
        const newParticipant = await storage.createBillSplitParticipant({
          billSplitId: billSplitId,
          name: participant.name,
          email: participant.email || null,
          userId: participantUserId,
          amountOwed: participant.amount || (parseFloat(billSplit.totalAmount) / participants.length).toString()
        });
        
        // Send email invitation if email is provided
        if (participant.email && newParticipant) {
          try {
            const emailResult = await emailService.sendBillSplitInvitation({
              billSplit: billSplit,
              participantName: participant.name,
              participantEmail: participant.email,
              amountOwed: newParticipant.amountOwed,
              creatorName: creatorName
            });
            
            emailSent = !!emailResult;
            console.log(`📧 Email invitation ${emailSent ? 'sent' : 'failed'} to ${participant.email}`);
          } catch (emailError) {
            console.error('Error sending email invitation:', emailError);
            emailSent = false;
          }
        }
        
        inviteResults.push({
          participant: newParticipant,
          userExists: !!participantUserId,
          inviteSent: emailSent
        });
      }
      
      const emailsSentCount = inviteResults.filter(r => r.inviteSent).length;
      const message = emailsSentCount > 0 ? 
        `Invitations sent! ${emailsSentCount} email(s) sent successfully.` :
        "Participants added to bill split.";
      
      res.json({ 
        message,
        results: inviteResults,
        emailsSent: emailsSentCount,
        totalInvites: inviteResults.length
      });
    } catch (error) {
      console.error('Error processing invitations:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Profile routes
  app.get("/api/profile", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      
      console.log(`👀 Profile GET request for user ${userId}`);
      
      // Try to get user from database first
      let user = await storage.getUser(userId);
      
      console.log(`🗄️ Database user data:`, user ? {
        id: user.id,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        timezone: user.timezone,
        language: user.language,
        updatedAt: user.updatedAt
      } : 'NOT FOUND');
      
      console.log(`🎫 Auth0 JWT payload data:`, {
        name: req.auth?.payload?.name,
        given_name: req.auth?.payload?.given_name,
        family_name: req.auth?.payload?.family_name,
        email: req.auth?.payload?.email
      });
      
      // If user doesn't exist in our database, get from Auth0 and create
      if (!user) {
        console.log(`➕ User not found in database, creating from Auth0 data`);
        try {
          const auth0User = await Auth0ManagementService.getUser(userId);
          const newUser = await storage.createUser({
            id: userId,
            username: auth0User.email?.split('@')[0] || userId,
            email: auth0User.email as string,
            firstName: auth0User.given_name as string || null,
            lastName: auth0User.family_name as string || null,
            displayName: auth0User.name as string || null,
            profilePicture: auth0User.picture as string || null,
          });
          user = newUser;
        } catch (error) {
          console.error('Error creating user from Auth0 data:', error);
          // Fallback to Auth0 payload
          return res.json({
            id: userId,
            displayName: req.auth?.payload?.name || "",
            email: req.auth?.payload?.email || "",
            timezone: "UTC",
            language: "English"
          });
        }
      }
      
      // Always use database displayName directly - don't fall back to Auth0
      console.log(`📤 Profile GET response - displayName from database: "${user.displayName}"`);
      
      // Return user profile data
      res.json({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        timezone: user.timezone || "UTC",
        language: user.language || "English",
        profilePicture: user.profilePicture,
        userMetadata: user.userMetadata,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    } catch (error) {
      console.error('Profile get error:', error);
      res.status(500).json({ message: 'Failed to get profile' });
    }
  });

  app.put("/api/profile", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { displayName, firstName, lastName, timezone, language, userMetadata } = req.body;
      
      console.log(`🔄 Profile update request for user ${userId}`);
      console.log(`📝 Update data:`, { displayName, firstName, lastName, timezone, language, userMetadata });
      
      // First check if user exists, if not create them
      let user = await storage.getUser(userId);
      console.log(`👤 Existing user found:`, user ? 'YES' : 'NO');
      
      if (!user) {
        console.log(`➕ Creating new user ${userId}`);
        // Create user from Auth0 payload if they don't exist
        try {
          user = await storage.createUser({
            id: userId,
            username: req.auth?.payload?.nickname || req.auth?.payload?.email?.split('@')[0] || userId,
            email: req.auth?.payload?.email as string || `${userId}@unknown.com`,
            firstName: req.auth?.payload?.given_name as string || null,
            lastName: req.auth?.payload?.family_name as string || null,
            displayName: req.auth?.payload?.name as string || null,
          });
          console.log(`✅ User created successfully:`, user);
        } catch (createError) {
          console.error('Error creating user:', createError);
          return res.status(500).json({ message: 'Failed to create user profile' });
        }
      }
      
      console.log(`🔧 Attempting to update user ${userId} with storage type:`, storage.constructor.name);
      // Update user in database
      const updatedUser = await storage.updateUser(userId, {
        displayName,
        firstName,
        lastName,
        timezone,
        language,
        userMetadata
      });
      
      console.log(`💾 Update result:`, updatedUser ? 'SUCCESS' : 'FAILED');
      if (updatedUser) {
        console.log(`📊 Updated user data:`, {
          id: updatedUser.id,
          displayName: updatedUser.displayName,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          timezone: updatedUser.timezone,
          language: updatedUser.language,
          updatedAt: updatedUser.updatedAt
        });
      }
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'Failed to update user profile' });
      }
      
      // Also update user metadata in Auth0 if needed
      try {
        await Auth0ManagementService.updateUserMetadata(userId, {
          displayName,
          timezone,
          language,
          ...userMetadata
        });
      } catch (error) {
        console.warn('Failed to update Auth0 metadata:', error);
        // Don't fail the request if Auth0 update fails
      }
      
      res.json({
        id: updatedUser.id,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        timezone: updatedUser.timezone,
        language: updatedUser.language,
        profilePicture: updatedUser.profilePicture,
        userMetadata: updatedUser.userMetadata,
        updatedAt: updatedUser.updatedAt
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ message: 'Failed to update profile' });
    }
  });

  // User management routes
  app.post("/api/profile/change-password", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      await Auth0ManagementService.sendPasswordChangeEmail(userId);
      res.json({ message: "Password change email sent successfully" });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ message: "Failed to send password change email" });
    }
  });

  app.delete("/api/profile/account", checkJwt, async (req, res, next) => {
    try {
      const userId = getUserIdFromAuth(req);
      console.log(`Received request to delete account for user: ${userId}`);

      // First, delete user data from our application's database
      await storage.deleteUserData(userId);
      console.log(`Database cleanup complete for user: ${userId}`);

      // Then, delete the user from Auth0
      await Auth0ManagementService.deleteUser(userId);
      console.log(`Auth0 account deletion successful for user: ${userId}`);

      res.json({ message: "Account deleted successfully from all systems" });
    } catch (error) {
      // Let the central error handler deal with it
      next(error); 
    }
  });

  app.get("/api/profile/mfa-status", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const mfaStatus = await Auth0ManagementService.checkMFAStatus(userId);
      res.json(mfaStatus);
    } catch (error) {
      console.error('MFA status error:', error);
      res.status(500).json({ message: "Failed to get MFA status" });
    }
  });

  app.post("/api/profile/enable-mfa", checkJwt, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const enrollmentTicket = await Auth0ManagementService.generateMFAEnrollmentTicket(userId);
      res.json({ enrollmentUrl: enrollmentTicket });
    } catch (error) {
      console.error('MFA enrollment error:', error);
      res.status(500).json({ message: "Failed to generate MFA enrollment" });
    }
  });

  // Financial products routes (public)
  app.get("/api/financial-products", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const products = await storage.getFinancialProducts(category);

      const safeProducts = products ?? [];
      const body = JSON.stringify(safeProducts);
      const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
      res.set({
        'Cache-Control': 'public, max-age=60, must-revalidate',
        'ETag': etag,
      });
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }

      res.json(safeProducts);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/financial-products/:id", async (req, res) => {
    const productId = Number(req.params.id);
    const product = await storage.getFinancialProduct(productId);
    if (!product) {
      return res.status(404).json({ message: "Financial product not found" });
    }
    res.json(product);
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
