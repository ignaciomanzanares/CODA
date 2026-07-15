import type { Express, Request, Response } from "express";

import { authenticate } from "./middleware/auth.js";

import { logger } from "./logger.js";

import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerPushRoutes(app: Express): Promise<void> {
  // =====================================================
  // PUSH NOTIFICATION ENDPOINTS
  // =====================================================

  // Get VAPID public key (needed by frontend to subscribe)
  app.get("/api/push/vapid-key", async (_req, res) => {
    try {
      const { getVapidPublicKey } = await import("./services/pushService.js");
      const key = getVapidPublicKey();
      if (!key) {
        return res.status(503).json({ message: "Push notifications not configured" });
      }
      res.json({ publicKey: key });
    } catch (error) {
      res.status(503).json({ message: "Push not available" });
    }
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { subscription } = req.body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ message: "Invalid push subscription" });
      }
      const { saveSubscription } = await import("./services/pushService.js");
      await saveSubscription(userId, subscription, req.headers["user-agent"]);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to save push subscription");
      res.status(500).json({ message: "Error saving subscription" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/push/unsubscribe", authenticate, async (req: Request, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ message: "Missing endpoint" });
      }
      const { removeSubscription } = await import("./services/pushService.js");
      await removeSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to remove push subscription");
      res.status(500).json({ message: "Error removing subscription" });
    }
  });

  // Test push notification (dev/debug)
  app.post("/api/push/test", authenticate, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { sendPushToUser } = await import("./services/pushService.js");
      const sent = await sendPushToUser(userId, {
        title: "CODA — Prueba",
        body: "¡Las notificaciones push funcionan correctamente!",
        url: "/panel",
      });
      res.json({ success: true, devicesSent: sent });
    } catch (error) {
      logger.error({ error }, "Failed to send test push");
      res.status(500).json({ message: "Error al enviar la notificación de prueba" });
    }
  });

  // Document upload: Import enhanced middleware with validation, OCR support
}
