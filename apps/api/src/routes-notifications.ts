import type { Express } from "express";

import { authenticate } from "./middleware/auth.js";
import { notificationService } from "./services/notificationService.js";

import { logger } from "./logger.js";

import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerNotificationsRoutes(app: Express): Promise<void> {
  app.get("/api/notifications", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const { category, unreadOnly, limit, offset } = req.query;

      const options = {
        category: category as string | undefined,
        unreadOnly: unreadOnly === "true",
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      };

      const notifications = await notificationService.getNotifications(userId, options);
      // Return fresh JSON always to avoid client-side 304 handling issues with fetch
      res.set({ "Cache-Control": "private, max-age=0, no-cache" });
      res.json(notifications);
    } catch (error) {
      logger.error({ err: error }, "Error fetching notifications");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const notificationId = Number(req.params.id);

      const success = await notificationService.markAsRead(notificationId, userId);

      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json({ message: "Notification marked as read" });
    } catch (error) {
      logger.error({ err: error }, "Error marking notification as read");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/notifications/read-all", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);

      const success = await notificationService.markAllAsRead(userId);

      res.json({
        message: success ? "All notifications marked as read" : "No unread notifications found",
      });
    } catch (error) {
      logger.error({ err: error }, "Error marking all notifications as read");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/notifications/:id", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const notificationId = Number(req.params.id);

      const success = await notificationService.deleteNotification(notificationId, userId);

      // Be idempotent: return 200 even if already deleted or not found for this user.
      // This prevents stale UI state from causing visible errors.
      if (!success) {
        return res.json({ message: "Notification deleted (or already removed)" });
      }

      res.json({ message: "Notification deleted" });
    } catch (error) {
      logger.error({ err: error }, "Error deleting notification");
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/notifications/unread-count", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);
      const count = await notificationService.getUnreadCount(userId);

      res.json({ count });
    } catch (error) {
      logger.error({ err: error }, "Error fetching unread count");
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
