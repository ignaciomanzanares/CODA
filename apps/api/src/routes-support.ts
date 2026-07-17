/**
 * Canal de reclamos y consultas (NCG 502): el usuario crea y consulta sus
 * casos; el admin los lista y responde. El aviso por email es best-effort —
 * el registro en DB es la fuente de verdad del canal.
 */
import type { Express, Request, Response } from "express";
import { authenticate, ensureUserForToken, requireAdmin } from "./middleware/auth.js";
import type { AuthenticatedRequest } from "./middleware/auth.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./logger.js";
import { storage } from "./storage.js";

const SUPPORT_INBOX = process.env.SUPPORT_INBOX_EMAIL ?? "info@codafinance.cl";

export async function registerSupportRoutes(app: Express): Promise<void> {
  const {
    createTicket,
    listTicketsForUser,
    listAllTickets,
    respondTicket,
    TICKET_TIPOS,
    TICKET_ESTADOS,
  } = await import("./services/support/supportTickets.js");

  // POST /api/support/tickets — crear reclamo o consulta
  app.post(
    "/api/support/tickets",
    authenticate,
    apiLimiter,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

        const { tipo, asunto, mensaje } = (req.body ?? {}) as {
          tipo?: string;
          asunto?: string;
          mensaje?: string;
        };
        if (!TICKET_TIPOS.includes(tipo as never)) {
          return res.status(400).json({ message: "Tipo inválido: usa 'reclamo' o 'consulta'." });
        }
        if (!asunto?.trim() || asunto.trim().length < 3) {
          return res
            .status(400)
            .json({ message: "El asunto es obligatorio (mínimo 3 caracteres)." });
        }
        if (!mensaje?.trim() || mensaje.trim().length < 10) {
          return res.status(400).json({ message: "Describe tu caso con al menos 10 caracteres." });
        }

        const ticket = await createTicket(userId, {
          tipo: tipo as (typeof TICKET_TIPOS)[number],
          asunto,
          mensaje,
        });

        // Aviso al buzón interno — best-effort, jamás bloquea el registro.
        try {
          const user = await storage.getUser(userId);
          const { emailService } = await import("./services/emailService.js");
          void emailService.sendSupportTicketAlert(SUPPORT_INBOX, {
            folio: ticket.folio,
            tipo: ticket.tipo,
            asunto: ticket.asunto,
            userEmail: (user as { email?: string } | undefined)?.email ?? "desconocido",
          });
        } catch (e) {
          logger.warn({ err: e }, "[support] aviso por email falló (no fatal)");
        }

        res.status(201).json({ ticket });
      } catch (e) {
        logger.error({ err: e }, "[support] crear ticket falló");
        res.status(500).json({ message: "No pudimos registrar tu caso. Intenta de nuevo." });
      }
    },
  );

  // GET /api/support/tickets — casos propios (más recientes primero)
  app.get("/api/support/tickets", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });
      res.json({ tickets: await listTicketsForUser(userId) });
    } catch (e) {
      logger.error({ err: e }, "[support] listar tickets falló");
      res.status(500).json({ message: "Error al obtener tus casos." });
    }
  });

  // GET /api/admin/support/tickets — todos los casos (admin)
  app.get(
    "/api/admin/support/tickets",
    authenticate,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const tickets = await listAllTickets();
        // Email del usuario para gestionar el caso (join liviano).
        const withEmail = await Promise.all(
          tickets.map(async (t) => {
            const u = (await storage.getUser(t.userId).catch(() => null)) as {
              email?: string;
            } | null;
            return { ...t, userEmail: u?.email ?? null };
          }),
        );
        res.json({ tickets: withEmail });
      } catch (e) {
        logger.error({ err: e }, "[support] listar tickets admin falló");
        res.status(500).json({ message: "Error al obtener los casos." });
      }
    },
  );

  // PATCH /api/admin/support/tickets/:id — responder / cambiar estado (admin)
  app.patch(
    "/api/admin/support/tickets/:id",
    authenticate,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ message: "Id inválido." });
        }
        const { estado, respuesta } = (req.body ?? {}) as {
          estado?: string;
          respuesta?: string;
        };
        if (estado && !TICKET_ESTADOS.includes(estado as never)) {
          return res.status(400).json({ message: "Estado inválido." });
        }
        if (!estado && !respuesta?.trim()) {
          return res.status(400).json({ message: "Nada que actualizar." });
        }

        const ticket = await respondTicket(id, {
          estado: estado as (typeof TICKET_ESTADOS)[number] | undefined,
          respuesta,
        });
        if (!ticket) return res.status(404).json({ message: "Caso no encontrado." });

        // Notificar al usuario cuando hay respuesta — best-effort.
        if (respuesta?.trim()) {
          try {
            const u = (await storage.getUser(ticket.userId).catch(() => null)) as {
              email?: string;
            } | null;
            if (u?.email) {
              const { emailService } = await import("./services/emailService.js");
              void emailService.sendSupportTicketReply(u.email, {
                folio: ticket.folio,
                asunto: ticket.asunto,
                respuesta: ticket.respuesta ?? "",
              });
            }
          } catch (e) {
            logger.warn({ err: e }, "[support] aviso de respuesta falló (no fatal)");
          }
        }

        res.json({ ticket });
      } catch (e) {
        logger.error({ err: e }, "[support] responder ticket falló");
        res.status(500).json({ message: "Error al actualizar el caso." });
      }
    },
  );
}
