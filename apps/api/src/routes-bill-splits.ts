import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";

import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { emailService } from "./services/emailService.js";
import { notificationService } from "./services/notificationService.js";

import { logger } from "./logger.js";

import {
  validateBody,
  validateParams,
  idParamSchema,
  createBillSplitSchema,
  updateBillSplitSchema,
  updateBillSplitParticipantSchema,
} from "./middleware/validation.js";
import type { BillSplitParticipant } from "./schema.js";
import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerBillSplitsRoutes(app: Express): Promise<void> {
  // =============================================
  // PUBLIC BILL SPLIT ROUTES (No authentication)
  // =============================================

  // Get bill split by share code (public - anyone with link can view)
  app.get("/api/share/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const billSplit = await storage.getBillSplitByShareCode(code);

      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found or link expired" });
      }

      // Get participants
      const participants = await storage.getBillSplitParticipants(billSplit.id as number);

      // Get creator name
      const creator = await storage.getUser(billSplit.createdBy);
      const creatorName = creator
        ? `${creator.firstName || ""} ${creator.lastName || ""}`.trim() || creator.username
        : "Unknown";

      // Calculate progress
      const paidCount = participants.filter((p: BillSplitParticipant) => p.isPaid).length;
      const totalPaid = participants.reduce(
        (sum: number, p: BillSplitParticipant) =>
          sum + (p.isPaid ? parseFloat(String(p.amountOwed)) : 0),
        0,
      );

      res.json({
        id: billSplit.id,
        name: billSplit.name,
        description: billSplit.description,
        totalAmount: billSplit.totalAmount,
        date: billSplit.date,
        status: billSplit.status,
        createdByName: creatorName,
        shareCode: billSplit.shareCode,
        participants: participants.map((p: BillSplitParticipant) => ({
          id: p.id,
          name: p.name,
          amountOwed: p.amountOwed,
          isPaid: p.isPaid,
          amountPaid: p.amountPaid,
        })),
        progress: {
          paidCount,
          totalCount: participants.length,
          totalPaid,
          percentPaid:
            participants.length > 0 ? Math.round((paidCount / participants.length) * 100) : 0,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching shared bill split");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Pay your share (public - identify by name/email)
  app.post("/api/share/:code/pay", async (req, res) => {
    try {
      const { code } = req.params;
      const { participantId, name, email, paymentMethod } = req.body;

      const billSplit = await storage.getBillSplitByShareCode(code);
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found" });
      }

      const participants = await storage.getBillSplitParticipants(billSplit.id as number);

      // Find participant by ID, name, or email
      const participant = participants.find(
        (p: BillSplitParticipant) =>
          (participantId && p.id === participantId) ||
          (name && p.name.toLowerCase() === name.toLowerCase()) ||
          (email && p.email && p.email.toLowerCase() === email.toLowerCase()),
      );

      if (!participant) {
        return res.status(404).json({
          message: "Participant not found. Please check your name matches exactly.",
          availableNames: participants
            .filter((p: BillSplitParticipant) => !p.isPaid)
            .map((p: BillSplitParticipant) => p.name),
        });
      }

      if (participant.isPaid) {
        return res.status(400).json({ message: "This participant has already paid" });
      }

      // Mark as paid
      const updatedParticipant = await storage.updateBillSplitParticipant(
        participant.id as number,
        {
          isPaid: true,
          amountPaid: participant.amountOwed,
        },
      );

      // Notify the bill creator
      try {
        await notificationService.notifyBillSplitPaymentReceived(
          billSplit.createdBy,
          participant.name,
          parseFloat(String(participant.amountOwed)),
          billSplit.name,
          billSplit.id as number,
        );
      } catch (err) {
        logger.error({ err }, "Error sending payment notification");
      }

      // Check if all participants have paid
      const updatedParticipants = await storage.getBillSplitParticipants(billSplit.id as number);
      const allPaid = updatedParticipants.every((p: BillSplitParticipant) => !!p.isPaid);

      if (allPaid) {
        await storage.updateBillSplit(billSplit.id as number, { status: "settled" });
      }

      res.json({
        message: `¡Pago confirmado! Gracias, ${participant.name}.`,
        participant: {
          id: updatedParticipant?.id,
          name: updatedParticipant?.name,
          amountPaid: updatedParticipant?.amountOwed,
          isPaid: true,
        },
        allPaid,
        paymentMethod: paymentMethod || "other",
      });
    } catch (error) {
      logger.error({ err: error }, "Error processing payment");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Join a bill split (link participant to logged-in user's account)
  app.post("/api/share/:code/join", authenticate, async (req, res) => {
    try {
      const { code } = req.params;
      const { participantId } = req.body;
      const userId = getUserIdFromAuth(req);

      const billSplit = await storage.getBillSplitByShareCode(code);
      if (!billSplit) {
        return res.status(404).json({ message: "Bill split not found" });
      }

      const participants = await storage.getBillSplitParticipants(billSplit.id as number);

      // Find the participant
      const participant = participants.find((p: BillSplitParticipant) => p.id === participantId);
      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }

      // Check if participant is already linked to a user
      if (participant.userId) {
        return res
          .status(400)
          .json({ message: "This participant is already linked to an account" });
      }

      // Check if current user is already a participant in this split
      const existingParticipation = participants.find(
        (p: BillSplitParticipant) => p.userId === userId,
      );
      if (existingParticipation) {
        return res.status(400).json({ message: "You are already a participant in this split" });
      }

      // Link the participant to the current user
      const updatedParticipant = await storage.updateBillSplitParticipant(
        participant.id as number,
        {
          userId: userId,
        },
      );

      // Get user info for notification
      const user = await storage.getUser(userId);
      const userName = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username
        : "Alguien";

      // Notify the bill creator
      try {
        await storage.createNotification({
          userId: billSplit.createdBy,
          type: "bill_split",
          category: "bill_split",
          title: "Alguien se unió a tu dividir cuenta",
          message: `${userName} se unió a "${billSplit.name}" como ${participant.name}.`,
        });
      } catch (err) {
        logger.error({ err }, "Error sending join notification");
      }

      res.json({
        message: `Te añadieron como ${participant.name} en este dividir cuenta.`,
        participant: {
          id: updatedParticipant?.id,
          name: updatedParticipant?.name,
          amountOwed: updatedParticipant?.amountOwed,
          isPaid: updatedParticipant?.isPaid,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error joining bill split");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bill splits routes
  app.get("/api/bill-splits", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const userEmail = (req as AuthenticatedRequest).user?.email;

      const possibleEmail = userEmail;

      // Ensure user exists in database (create if needed)
      let user = await storage.getUser(userId);
      if (!user && possibleEmail) {
        // Reuse account by email to avoid unique-email conflicts when token userId changes.
        user = await storage.getUserByEmail(String(possibleEmail));
        if (!user) {
          const userName = String((req as AuthenticatedRequest).user?.name || "User");
          const [firstName, ...lastNameParts] = userName.split(" ");
          user = await storage.createUser({
            id: userId,
            username: String((req as AuthenticatedRequest).user?.name || userId),
            email: String(possibleEmail),
            passwordHash: "jwt-auth",
            firstName: firstName || "User",
            lastName: lastNameParts.length > 0 ? lastNameParts.join(" ") : null,
          });
        }
      }
      const canonicalUserId = user?.id ? String(user.id) : userId;

      // Link existing participant records to this user if they match by email
      if (possibleEmail) {
        const unlinkedParticipants = await storage.getUnlinkedParticipantsByEmail(
          String(possibleEmail),
        );
        if (unlinkedParticipants && unlinkedParticipants.length > 0) {
          for (const participant of unlinkedParticipants) {
            await storage.updateBillSplitParticipant(participant.id, { userId: canonicalUserId });
          }
        }
      }

      // Get bill splits where user is the creator
      const createdBillSplits = await storage.getBillSplits(canonicalUserId);

      // Get bill splits where user is a participant
      const participantBillSplits = await storage.getBillSplitsAsParticipant(canonicalUserId);

      // Combine and deduplicate (in case user is both creator and participant)
      const allBillSplits = [...createdBillSplits];
      for (const participantSplit of participantBillSplits) {
        if (!createdBillSplits.some((cs) => cs.id === participantSplit.id)) {
          allBillSplits.push(participantSplit);
        }
      }

      // Fetch participants for each bill split and add user role info (explicit shape for frontend balance calc)
      const billSplitsWithParticipants = await Promise.all(
        allBillSplits.map(async (billSplit) => {
          const participants = await storage.getBillSplitParticipants(billSplit.id as number);
          const createdBy = billSplit.createdBy ?? (billSplit as any).created_by;
          const isCreator = String(createdBy) === canonicalUserId;
          const isParticipant = participants.some(
            (p: BillSplitParticipant) => String(p.userId ?? (p as any).user_id) === canonicalUserId,
          );

          // Solo un participante puede ser "tú": si eres creador, solo el primero (índice 0); si no, el que tenga tu userId
          const participantsWithCurrentUser = participants.map(
            (p: BillSplitParticipant, i: number) => {
              const pUserId = p.userId ?? (p as any).user_id;
              const matchesUserId = String(pUserId) === canonicalUserId;
              const isCurrentUser = isCreator ? matchesUserId && i === 0 : matchesUserId;
              return {
                id: p.id,
                name: p.name,
                email: p.email,
                userId: pUserId,
                amountOwed:
                  typeof p.amountOwed === "number"
                    ? p.amountOwed
                    : Number(p.amountOwed ?? (p as any).amount_owed ?? 0),
                isPaid: !!p.isPaid,
                amountPaid:
                  typeof p.amountPaid === "number"
                    ? p.amountPaid
                    : Number(p.amountPaid ?? (p as any).amount_paid ?? 0),
                isCurrentUser,
              };
            },
          );
          return {
            ...billSplit,
            createdBy: createdBy ?? billSplit.createdBy,
            participants: participantsWithCurrentUser,
            userRole: isCreator ? "creator" : isParticipant ? "participant" : "none",
          };
        }),
      );
      // Evitar caché/304 para que el cliente siempre reciba datos frescos y actualice saldos
      res.set({ "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" });
      res.json(billSplitsWithParticipants);
    } catch (error) {
      logger.error({ err: error }, "Error fetching bill splits");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/bill-splits",
    authenticate,
    validateBody(createBillSplitSchema),
    async (req, res) => {
      try {
        const userId = getUserIdFromAuth(req);

        // Ensure user exists in database (create if needed)
        let user = await storage.getUser(userId);
        if (!user) {
          const userEmail = String(
            (req as AuthenticatedRequest).user?.email || `${userId}@unknown.com`,
          );
          // Reuse existing email owner first to avoid unique-email violations.
          user = await storage.getUserByEmail(userEmail);
          if (!user) {
            const userName = String((req as AuthenticatedRequest).user?.name || "User");
            const [firstName, ...lastNameParts] = userName.split(" ");
            user = await storage.createUser({
              id: userId,
              username: String((req as AuthenticatedRequest).user?.name || userId),
              email: userEmail,
              passwordHash: "jwt-auth",
              firstName: firstName || "User",
              lastName: lastNameParts.length > 0 ? lastNameParts.join(" ") : null,
            });
            logger.info({ userId, email: userEmail }, "Created new user");
          }
        }

        // Extract participants and optional flags from request body (don't include in bill split data)
        const {
          participants: participantsFromBody,
          alsoAddToExpenses,
          ...billSplitFields
        } = req.body;

        // Generate a unique share code for the bill split
        const shareCode = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

        const billSplitData = {
          ...billSplitFields,
          // Use canonical DB user id (returned from createUser) when available
          createdBy: user && user.id ? user.id : userId,
          // Ensure date is a proper Date object
          date: req.body.date ? new Date(req.body.date) : new Date(),
          // Add share code for sharing the bill split
          shareCode: shareCode,
        };
        const billSplit = await storage.createBillSplit(billSplitData);

        // Create notification for bill split creation
        try {
          logger.debug(
            { userId, name: billSplit.name, amount: billSplit.totalAmount },
            "Creating bill split notification",
          );
          await notificationService.notifyBillSplitCreated(
            userId,
            billSplit.name || "New Bill Split",
            billSplit.totalAmount,
            billSplit.id as number,
          );
          logger.debug("Bill split notification created");
        } catch (notificationError) {
          logger.error({ err: notificationError }, "Error creating bill split notification");
        }

        // Create participants if provided and send email invitations
        if (participantsFromBody && Array.isArray(participantsFromBody)) {
          const creatorName = user
            ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username
            : (req as AuthenticatedRequest).user?.name ||
              (req as AuthenticatedRequest).user?.name ||
              "Alguien";

          for (const participant of participantsFromBody) {
            let participantUserId = null;
            if (participant.isCreator) {
              participantUserId = userId;
            } else if (participant.email) {
              const existingUser = await storage.getUserByEmail(participant.email);
              if (existingUser) participantUserId = existingUser.id;
            }
            if (!participantUserId && participant.userId) participantUserId = participant.userId;

            const newParticipant = await storage.createBillSplitParticipant({
              billSplitId: billSplit.id as number,
              name: participant.name || "Unknown",
              email: participant.email || null,
              userId: participantUserId,
              amountOwed:
                participant.amountOwed ||
                (billSplit.totalAmount / participantsFromBody.length).toFixed(2),
              isPaid: participant.isPaid || false,
              amountPaid: participant.isPaid ? participant.amountOwed || 0 : 0,
            });

            // Send email invitation if email is provided
            if (participant.email && newParticipant) {
              try {
                const emailResult = await emailService.sendBillSplitInvitation({
                  billSplit: billSplit,
                  participantName: participant.name,
                  participantEmail: participant.email,
                  amountOwed: newParticipant.amountOwed.toFixed(2),
                  creatorName: String(creatorName),
                });

                const emailSent = !!emailResult;
                if (emailSent) {
                  logger.info({ email: participant.email }, "Email invitation sent");
                }
              } catch (emailError) {
                logger.error({ err: emailError }, "Error sending email invitation");
              }
            }
          }

          // Check if all participants are already paid (auto-settle)
          const allParticipants = await storage.getBillSplitParticipants(billSplit.id as number);
          const allPaid =
            allParticipants.length > 0 &&
            allParticipants.every((p: BillSplitParticipant) => !!p.isPaid);
          if (allPaid) {
            await storage.updateBillSplit(billSplit.id as number, { status: "settled" });
            billSplit.status = "settled";
          }
        }

        // Optionally add this bill split as an expense in the user's expenses list
        // Only add the creator's share (totalAmount / number of participants)
        if (alsoAddToExpenses && billSplit.id) {
          try {
            const totalAmount =
              typeof billSplit.totalAmount === "number"
                ? billSplit.totalAmount
                : parseFloat(String(billSplit.totalAmount));
            const expenseDate = billSplit.date
              ? new Date(billSplit.date).toISOString()
              : new Date().toISOString();
            const category = (billSplit as { category?: string }).category || "general";

            // Calculate creator's share: total amount divided by number of participants
            const allParticipants = await storage.getBillSplitParticipants(billSplit.id as number);
            const participantCount = allParticipants.length || 1;
            const creatorShare = totalAmount / participantCount;

            await storage.createExpense({
              userId: billSplit.createdBy ?? userId,
              amount: creatorShare,
              description: billSplit.name || "Gasto compartido",
              name: billSplit.name || undefined,
              category: category,
              date: expenseDate,
              isRecurring: 0,
              isAutoClassified: 0,
            });
            logger.info(
              {
                userId,
                billSplitId: billSplit.id,
                name: billSplit.name,
                totalAmount,
                creatorShare,
                participantCount,
              },
              "Added bill split to expenses (creator share only)",
            );
          } catch (expenseErr) {
            logger.error(
              { err: expenseErr, billSplitId: billSplit.id },
              "Failed to add bill split to expenses",
            );
            // Do not fail the bill split creation; expense is optional
          }
        }

        // Return full shape (same as GET) so frontend balance updates immediately
        const participantsList = await storage.getBillSplitParticipants(billSplit.id as number);
        const creatorName = user
          ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username
          : (req as AuthenticatedRequest).user?.name || "Usuario";
        const createdBy = billSplit.createdBy ?? (billSplit as any).created_by;
        // Solo el creador (índice 0) puede ser "tú" en la respuesta del POST
        const participantsPayload = participantsList.map((p: BillSplitParticipant, i: number) => {
          const pUserId = p.userId ?? (p as any).user_id;
          const matchesUserId = String(pUserId) === userId;
          const isCurrentUser = matchesUserId && i === 0;
          return {
            id: p.id,
            name: p.name,
            email: p.email,
            userId: pUserId,
            amountOwed:
              typeof p.amountOwed === "number"
                ? p.amountOwed
                : Number(p.amountOwed ?? (p as any).amount_owed ?? 0),
            isPaid: !!p.isPaid,
            amountPaid:
              typeof p.amountPaid === "number"
                ? p.amountPaid
                : Number(p.amountPaid ?? (p as any).amount_paid ?? 0),
            isCurrentUser,
          };
        });
        const payload = {
          ...billSplit,
          createdBy: createdBy ?? billSplit.createdBy,
          createdByName: creatorName,
          participants: participantsPayload,
          userRole: "creator" as const,
        };
        res.status(201).json(payload);
      } catch (error) {
        logger.error({ err: error }, "Error creating bill split");
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/bill-splits/:id",
    authenticate,
    validateParams(idParamSchema),
    validateBody(updateBillSplitSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      const updateData = {
        ...req.body,
        // Convert date string to Date object if date is provided
        ...(req.body.date && { date: new Date(req.body.date) }),
      };
      const updatedBillSplit = await storage.updateBillSplit(billSplitId, updateData);
      res.json(updatedBillSplit);
    },
  );

  app.delete(
    "/api/bill-splits/:id",
    authenticate,
    validateParams(idParamSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      await storage.deleteBillSplit(billSplitId);
      res.json({ message: "Bill split deleted" });
    },
  );

  app.put(
    "/api/bill-splits/:id/participants/:participantId",
    authenticate,
    validateBody(updateBillSplitParticipantSchema),
    async (req, res) => {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);
      const participantId = Number(req.params.participantId);
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }
      const updatedParticipant = await storage.updateBillSplitParticipant(participantId, req.body);
      res.json(updatedParticipant);
    },
  );

  // Mark participant as paid
  app.post(
    "/api/bill-splits/:id/participants/:participantId/pay",
    authenticate,
    async (req, res) => {
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
        const targetParticipant = participants.find(
          (p: BillSplitParticipant) => p.id === participantId,
        );

        if (!targetParticipant) {
          return res.status(404).json({ message: "Participant not found" });
        }

        const isCreator = String(billSplit.createdBy) === userId;
        const isTargetParticipant = String(targetParticipant.userId) === userId;

        if (!isCreator && !isTargetParticipant) {
          return res
            .status(403)
            .json({ message: "Not authorized to mark this participant as paid" });
        }

        const participant = await storage.updateBillSplitParticipant(participantId, {
          isPaid: true,
          amountPaid: req.body.amountPaid || req.body.amountOwed,
        });

        if (!participant) {
          return res.status(404).json({ message: "Participant not found" });
        }

        // Notify bill creator about payment
        if (String(billSplit.createdBy) !== userId) {
          // Only notify if payer is not the creator
          try {
            const payerUser = await storage.getUser(userId);
            const payerName = payerUser
              ? `${payerUser.firstName || ""} ${payerUser.lastName || ""}`.trim() ||
                payerUser.username
              : "Alguien";

            await notificationService.createNotification({
              userId: String(billSplit.createdBy),
              title: "Pago recibido",
              message: `${payerName} pagó su parte de "${billSplit.name}".`,
              type: "success",
              category: "bill_split",
              actionUrl: "/dividir-cuenta",
              metadata: JSON.stringify({
                billSplitId,
                participantId,
                paidAmount: participant.amountPaid,
              }),
            });
          } catch (notificationError) {
            logger.error({ err: notificationError }, "Error creating payment notification");
          }
        }

        // After marking payment, check if all participants are now paid and mark the
        // bill split as settled if so. Also return updated bill split info so the
        // frontend can refresh balances immediately.
        try {
          const participantsAfter = await storage.getBillSplitParticipants(billSplitId);
          const allPaidAfter =
            participantsAfter.length > 0 &&
            participantsAfter.every((p: BillSplitParticipant) => !!p.isPaid);
          let updatedBillSplit = billSplit;
          if (allPaidAfter) {
            await storage.updateBillSplit(billSplitId, { status: "settled" });
            updatedBillSplit = (await storage.getBillSplit(billSplitId)) || billSplit;
          }

          res.json({
            message: "Payment marked successfully",
            participant,
            billSplit: updatedBillSplit,
          });
        } catch (e) {
          // If anything goes wrong updating settlement status, still return success for payment
          logger.error({ err: e }, "Error updating bill split settlement status");
          res.json({ message: "Payment marked successfully", participant });
        }
      } catch (error) {
        logger.error({ err: error }, "Error marking payment");
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Archive/Complete a bill split
  app.post("/api/bill-splits/:id/archive", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const billSplitId = Number(req.params.id);

      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit || String(billSplit.createdBy) !== userId) {
        return res.status(404).json({ message: "Bill split not found" });
      }

      const updatedBillSplit = await storage.updateBillSplit(billSplitId, {
        status: "settled",
      });

      res.json({ message: "Bill split archived successfully", billSplit: updatedBillSplit });
    } catch (error) {
      logger.error({ err: error }, "Error archiving bill split");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Check if user exists for email invitation (no auth required).
  // userExists is only returned on success (200) — never on 403/404 to prevent email enumeration.
  app.get("/api/bill-splits/:id/check-user/:email", async (req: Request, res: Response) => {
    try {
      const billSplitId = Number(req.params.id);
      const email = decodeURIComponent(req.params.email);

      // Validate the bill split exists and the email is actually invited before revealing anything
      const billSplit = await storage.getBillSplit(billSplitId);
      if (!billSplit) {
        return res.status(404).json({ message: "Partida no encontrada" });
      }

      const participants = await storage.getBillSplitParticipants(billSplitId);
      const isInvited = participants.some(
        (p: BillSplitParticipant) => p.email && p.email.toLowerCase() === email.toLowerCase(),
      );

      if (!isInvited) {
        return res.status(403).json({ message: "Email not invited to this bill split" });
      }

      // Only reveal userExists once we've confirmed the email is a legitimate invitee
      const user = await storage.getUserByEmail(email);
      res.json({
        userExists: !!user,
        billSplitName: billSplit.name,
        invitedEmail: email,
        billSplitId: billSplitId,
      });
    } catch (error) {
      logger.error({ err: error }, "Error checking user for invitation");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send invitations for a bill split
  app.post("/api/bill-splits/:id/invite", authenticate, async (req: Request, res: Response) => {
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
      const creatorName = creatorUser
        ? `${creatorUser.firstName || ""} ${creatorUser.lastName || ""}`.trim() ||
          creatorUser.username
        : String(
            (req as AuthenticatedRequest).user?.name ||
              (req as AuthenticatedRequest).user?.name ||
              "Alguien",
          );

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
          amountOwed:
            participant.amount || (billSplit.totalAmount / participants.length).toFixed(2),
        });

        // Send email invitation if email is provided
        if (participant.email && newParticipant) {
          try {
            const emailResult = await emailService.sendBillSplitInvitation({
              billSplit: billSplit,
              participantName: participant.name,
              participantEmail: participant.email,
              amountOwed: newParticipant.amountOwed.toFixed(2),
              creatorName: String(creatorName),
            });

            emailSent = !!emailResult;
            logger.info({ email: participant.email, sent: emailSent }, "Email invitation status");
          } catch (emailError) {
            logger.error({ err: emailError }, "Error sending email invitation");
            emailSent = false;
          }
        }

        inviteResults.push({
          participant: newParticipant,
          userExists: !!participantUserId,
          inviteSent: emailSent,
        });
      }

      const emailsSentCount = inviteResults.filter((r) => r.inviteSent).length;
      const message =
        emailsSentCount > 0
          ? `Invitations sent! ${emailsSentCount} email(s) sent successfully.`
          : "Participants added to bill split.";

      res.json({
        message,
        results: inviteResults,
        emailsSent: emailsSentCount,
        totalInvites: inviteResults.length,
      });
    } catch (error) {
      logger.error({ err: error }, "Error processing invitations");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Profile routes - Auth operations should be rate limited
}

export async function registerBillSplitSharingRoutes(app: Express): Promise<void> {
  // =====================================================
  // BILL SPLIT PAYMENT LINKS & SHARING
  // =====================================================

  // Generate payment link + WhatsApp message for a bill split
  app.post(
    "/api/bill-splits/:id/payment-link",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserIdFromAuth(req);
        const billSplitId = Number(req.params.id);
        const { participantId, transferDetails } = req.body;

        if (!participantId || !transferDetails) {
          return res
            .status(400)
            .json({ success: false, message: "Se requiere participantId y transferDetails" });
        }

        // Get bill split
        const billSplit = await storage.getBillSplit(billSplitId);
        if (!billSplit || billSplit.createdBy !== userId) {
          return res
            .status(404)
            .json({ success: false, message: "Gasto compartido no encontrado" });
        }

        // Get participant
        const participants = await storage.getBillSplitParticipants(billSplitId);
        const participant = participants.find((p: any) => p.id === participantId);
        if (!participant) {
          return res.status(404).json({ success: false, message: "Participante no encontrado" });
        }

        const { createPaymentLink, generateWhatsAppMessage, generateShareData } =
          await import("./services/expenses/paymentLinkService.js");

        const baseUrl = process.env.WEB_URL || "https://coda-web-steel.vercel.app";

        const paymentLink = createPaymentLink({
          billSplitId,
          participantId,
          shareCode:
            billSplit.shareCode ||
            `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
          amount: participant.amountOwed,
          concept: billSplit.name,
          transferDetails,
        });

        const user = await storage.getUser(userId);

        const whatsappMessage = generateWhatsAppMessage({
          amount: participant.amountOwed,
          concept: billSplit.name,
          creatorName: user?.firstName || user?.username || "Usuario CODA",
          shareCode: billSplit.shareCode || paymentLink.shareCode,
          baseUrl,
          transferDetails: paymentLink.transferDetails,
        });

        const shareData = generateShareData({
          amount: participant.amountOwed,
          concept: billSplit.name,
          creatorName: user?.firstName || user?.username || "Usuario CODA",
          shareCode: billSplit.shareCode || paymentLink.shareCode,
          baseUrl,
        });

        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

        res.json({
          success: true,
          paymentLink,
          whatsappUrl,
          whatsappMessage,
          shareData,
          paymentUrl: `${baseUrl}/split/${billSplit.shareCode || paymentLink.shareCode}`,
        });
      } catch (error) {
        logger.error({ error }, "Failed to generate payment link");
        res.status(500).json({ success: false, message: "Error al generar link de pago" });
      }
    },
  );

  // Reconcile a notification with pending splits
  app.post(
    "/api/expenses/reconcile-notification",
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const userId = getUserIdFromAuth(req);
        const { text } = req.body;

        if (!text) {
          return res.status(400).json({ success: false, message: 'Se requiere "text"' });
        }

        const { parseNotification } = await import("./services/expenses/notificationParser.js");
        const notification = parseNotification(text);

        if (!notification) {
          return res.json({
            success: true,
            matches: [],
            message: "No se pudo interpretar la notificación",
          });
        }

        if (notification.operationType !== "abono") {
          return res.json({
            success: true,
            matches: [],
            notification,
            message: "Solo abonos se reconcilian",
          });
        }

        const { reconcileNotification } =
          await import("./services/expenses/reconciliationService.js");
        const matches = await reconcileNotification(userId, notification);

        // Auto-reconcile high-confidence matches
        const { autoReconcileAndNotify } =
          await import("./services/expenses/reconciliationService.js");
        for (const match of matches) {
          if (match.autoReconciled) {
            await autoReconcileAndNotify(userId, match);
          }
        }

        res.json({
          success: true,
          notification,
          matches,
          reconciled: matches.filter((m) => m.autoReconciled).length,
        });
      } catch (error) {
        logger.error({ error }, "Failed to reconcile notification");
        res.status(500).json({ success: false, message: "Error al reconciliar" });
      }
    },
  );
}
