import { storage } from "../storage";
import type { InsertNotification, Notification } from "@shared/schema";

export interface NotificationService {
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId: number, options?: GetNotificationsOptions): Promise<Notification[]>;
  markAsRead(notificationId: number, userId: number): Promise<boolean>;
  markAllAsRead(userId: number): Promise<boolean>;
  deleteNotification(notificationId: number, userId: number): Promise<boolean>;
  getUnreadCount(userId: number): Promise<number>;
}

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
  category?: string;
  unreadOnly?: boolean;
}

// Notification templates for consistent messaging
export const NotificationTemplates = {
  BILL_SPLIT_CREATED: (billName: string, amount: number) => ({
    title: "New Bill Split Created",
    message: `"${billName}" has been created for $${amount.toFixed(2)}. Check your share!`,
    type: "info" as const,
    category: "bill_split" as const,
    actionUrl: "/bill-split"
  }),

  BILL_SPLIT_PAYMENT_REMINDER: (billName: string, amount: number) => ({
    title: "Payment Reminder",
    message: `You owe $${amount.toFixed(2)} for "${billName}". Please settle up!`,
    type: "warning" as const,
    category: "bill_split" as const,
    actionUrl: "/bill-split"
  }),

  BILL_SPLIT_PAID: (billName: string, payer: string) => ({
    title: "Payment Received",
    message: `${payer} has paid their share for "${billName}".`,
    type: "success" as const,
    category: "bill_split" as const,
    actionUrl: "/bill-split"
  }),

  CREDIT_SCORE_UPDATED: (newScore: number, change: number) => ({
    title: "Credit Score Updated",
    message: `Your credit score is now ${newScore} (${change > 0 ? '+' : ''}${change} points).`,
    type: change > 0 ? "success" as const : "warning" as const,
    category: "credit_score" as const,
    actionUrl: "/dashboard"
  }),

  GOAL_MILESTONE: (goalName: string, progress: number) => ({
    title: "Goal Milestone Reached",
    message: `Great job! You've reached ${progress}% of your "${goalName}" goal.`,
    type: "success" as const,
    category: "goal" as const,
    actionUrl: "/goals"
  }),

  GOAL_DEADLINE_APPROACHING: (goalName: string, daysLeft: number) => ({
    title: "Goal Deadline Approaching",
    message: `Your "${goalName}" goal is due in ${daysLeft} days. Stay on track!`,
    type: "warning" as const,
    category: "goal" as const,
    actionUrl: "/goals"
  }),

  EXPENSE_UNUSUAL: (amount: number, category: string) => ({
    title: "Unusual Spending Detected",
    message: `You spent $${amount.toFixed(2)} on ${category}, which is higher than usual.`,
    type: "info" as const,
    category: "expense" as const,
    actionUrl: "/expenses"
  }),

  SECURITY_LOGIN: (location: string) => ({
    title: "New Login Detected",
    message: `A new login was detected from ${location}. If this wasn't you, please secure your account.`,
    type: "warning" as const,
    category: "security" as const,
    actionUrl: "/profile"
  }),

  PRODUCT_RECOMMENDATION: (productType: string) => ({
    title: "New Product Recommendation",
    message: `We found a ${productType} that might interest you based on your financial profile.`,
    type: "info" as const,
    category: "product" as const,
    actionUrl: "/products"
  })
};

class NotificationServiceImpl implements NotificationService {
  async createNotification(notification: InsertNotification): Promise<Notification> {
    return await storage.createNotification(notification);
  }

  async getNotifications(userId: number, options: GetNotificationsOptions = {}): Promise<Notification[]> {
    return await storage.getNotifications(userId, options);
  }

  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    return await storage.markNotificationAsRead(notificationId, userId);
  }

  async markAllAsRead(userId: number): Promise<boolean> {
    return await storage.markAllNotificationsAsRead(userId);
  }

  async deleteNotification(notificationId: number, userId: number): Promise<boolean> {
    return await storage.deleteNotification(notificationId, userId);
  }

  async getUnreadCount(userId: number): Promise<number> {
    return await storage.getUnreadNotificationCount(userId);
  }

  // Helper methods for common notification scenarios
  async notifyBillSplitCreated(userId: number, billName: string, amount: number, billSplitId?: number): Promise<Notification> {
    const template = NotificationTemplates.BILL_SPLIT_CREATED(billName, amount);
    return await this.createNotification({
      userId,
      ...template,
      metadata: { billSplitId }
    });
  }

  async notifyPaymentReminder(userId: number, billName: string, amount: number, billSplitId?: number): Promise<Notification> {
    const template = NotificationTemplates.BILL_SPLIT_PAYMENT_REMINDER(billName, amount);
    return await this.createNotification({
      userId,
      ...template,
      metadata: { billSplitId }
    });
  }

  async notifyCreditScoreChange(userId: number, newScore: number, oldScore: number): Promise<Notification> {
    const change = newScore - oldScore;
    const template = NotificationTemplates.CREDIT_SCORE_UPDATED(newScore, change);
    return await this.createNotification({
      userId,
      ...template,
      metadata: { newScore, oldScore, change }
    });
  }

  async notifyGoalMilestone(userId: number, goalName: string, progress: number, goalId?: number): Promise<Notification> {
    const template = NotificationTemplates.GOAL_MILESTONE(goalName, progress);
    return await this.createNotification({
      userId,
      ...template,
      metadata: { goalId, progress }
    });
  }

  async notifyUnusualExpense(userId: number, amount: number, category: string, expenseId?: number): Promise<Notification> {
    const template = NotificationTemplates.EXPENSE_UNUSUAL(amount, category);
    return await this.createNotification({
      userId,
      ...template,
      metadata: { expenseId, amount, category }
    });
  }

  async notifySecurityLogin(userId: number, location: string): Promise<Notification> {
    const template = NotificationTemplates.SECURITY_LOGIN(location);
    return await this.createNotification({
      userId,
      ...template,
      metadata: { location, timestamp: new Date().toISOString() }
    });
  }
}

export const notificationService = new NotificationServiceImpl();
