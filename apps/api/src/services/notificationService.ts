import { storage } from "../storage.js";
import type { InsertNotification, Notification } from "../schema.js";
import { sendPushToUser, type PushPayload } from "./pushService.js";

export interface NotificationService {
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId: string, options?: GetNotificationsOptions): Promise<Notification[]>;
  markAsRead(notificationId: number, userId: string): Promise<boolean>;
  markAllAsRead(userId: string): Promise<boolean>;
  deleteNotification(notificationId: number, userId: string): Promise<boolean>;
  getUnreadCount(userId: string): Promise<number>;
}

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
  category?: string;
  unreadOnly?: boolean;
}

function fmtClp(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Etiqueta en español para categorías de gasto (claves en inglés del cliente). */
export function expenseCategoryLabelEs(cat: string): string {
  const m: Record<string, string> = {
    groceries: "Supermercado",
    dining: "Restaurantes",
    food_delivery: "Comida a domicilio",
    transportation: "Transporte",
    housing: "Vivienda",
    healthcare: "Salud",
    entertainment: "Entretenimiento",
    shopping: "Compras",
    utilities: "Servicios",
    education: "Educación",
    travel: "Viajes",
    other: "Otros",
    // New taxonomy keys
    vivienda: "Vivienda",
    alimentacion: "Alimentación",
    transporte: "Transporte",
    seguros: "Seguros",
    servicios_basicos: "Servicios básicos",
    salud_bienestar: "Salud y bienestar",
    educacion: "Educación",
    cuidado_personal: "Cuidado personal",
    diversion: "Diversión",
    hobbies: "Hobbies",
    suscripciones: "Suscripciones",
    deudas: "Deudas",
    inversiones: "Inversiones",
    ahorros: "Ahorros",
    regalos: "Regalos",
    reparaciones: "Reparaciones y mantenimiento",
    imprevistos: "Imprevistos",
    telecomunicaciones: "Telecomunicaciones",
    comercio: "Comercio",
    entretenimiento: "Entretenimiento",
    salud: "Salud",
    ingreso_principal: "Ingreso",
    servicios: "Servicios",
    otro: "Otro",
  };
  return m[String(cat).toLowerCase()] ?? cat;
}

/** Textos de notificación en español (Chile). */
export const NotificationTemplates = {
  BILL_SPLIT_CREATED: (billName: string, amount: number) => ({
    title: "Nuevo dividir cuenta",
    message: `Se creó "${billName}" por ${fmtClp(amount)}. Revisa tu parte.`,
    type: "info" as const,
    category: "bill_split" as const,
    actionUrl: "/dividir-cuenta",
  }),

  BILL_SPLIT_PAYMENT_REMINDER: (billName: string, amount: number) => ({
    title: "Recordatorio de pago",
    message: `Debes ${fmtClp(amount)} por "${billName}". ¡Regulariza cuando puedas!`,
    type: "warning" as const,
    category: "bill_split" as const,
    actionUrl: "/dividir-cuenta",
  }),

  BILL_SPLIT_PAID: (billName: string, payer: string) => ({
    title: "Pago recibido",
    message: `${payer} pagó su parte de "${billName}".`,
    type: "success" as const,
    category: "bill_split" as const,
    actionUrl: "/dividir-cuenta",
  }),

  CREDIT_SCORE_UPDATED: (newScore: number, change: number) => ({
    title: "Score de crédito actualizado",
    message: `Tu score ahora es ${newScore} (${change > 0 ? "+" : ""}${change} puntos).`,
    type: change > 0 ? ("success" as const) : ("warning" as const),
    category: "credit_score" as const,
    actionUrl: "/panel",
  }),

  GOAL_CREATED: (goalName: string) => ({
    title: "Meta creada",
    message: `Tu meta "${goalName}" ha sido creada.`,
    type: "info" as const,
    category: "goal" as const,
    actionUrl: "/metas",
  }),

  GOAL_MILESTONE: (goalName: string, progress: number) => ({
    title: "Hito de meta alcanzado",
    message: `¡Bien! Llegaste al ${progress}% de tu meta "${goalName}".`,
    type: "success" as const,
    category: "goal" as const,
    actionUrl: "/metas",
  }),

  GOAL_DEADLINE_APPROACHING: (goalName: string, daysLeft: number) => ({
    title: "Fecha límite de meta cercana",
    message: `Tu meta "${goalName}" vence en ${daysLeft} días. ¡Sigue así!`,
    type: "warning" as const,
    category: "goal" as const,
    actionUrl: "/metas",
  }),

  EXPENSE_UNUSUAL: (amount: number, category: string) => ({
    title: "Gasto inusual",
    message: `Gastaste ${fmtClp(amount)} en ${category}, por encima de lo habitual.`,
    type: "info" as const,
    category: "expense" as const,
    actionUrl: "/gastos",
  }),

  SECURITY_LOGIN: (location: string) => ({
    title: "Nuevo inicio de sesión",
    message: `Detectamos un acceso desde ${location}. Si no fuiste tú, protege tu cuenta.`,
    type: "warning" as const,
    category: "security" as const,
    actionUrl: "/perfil",
  }),

  PRODUCT_RECOMMENDATION: (productType: string) => ({
    title: "Nueva recomendación",
    message: `Encontramos un ${productType} que podría interesarte según tu perfil.`,
    type: "info" as const,
    category: "product" as const,
    actionUrl: "/productos",
  }),
};

class NotificationServiceImpl implements NotificationService {
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const created = await storage.createNotification(notification);

    const pushPayload: PushPayload = {
      title: notification.title,
      body: notification.message,
      tag: notification.category,
      url: notification.actionUrl || "/",
    };
    sendPushToUser(notification.userId, pushPayload).catch(() => {});

    return created;
  }

  async getNotifications(
    userId: string,
    options: GetNotificationsOptions = {},
  ): Promise<Notification[]> {
    return await storage.getNotifications(userId, options);
  }

  async markAsRead(notificationId: number, userId: string): Promise<boolean> {
    return await storage.markNotificationAsRead(notificationId, userId);
  }

  async markAllAsRead(userId: string): Promise<boolean> {
    return await storage.markAllNotificationsAsRead(userId);
  }

  async deleteNotification(notificationId: number, userId: string): Promise<boolean> {
    return await storage.deleteNotification(notificationId, userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await storage.getUnreadNotificationCount(userId);
  }

  async notifyBillSplitCreated(
    userId: string,
    billName: string,
    amount: number,
    billSplitId?: number,
  ): Promise<Notification> {
    const template = NotificationTemplates.BILL_SPLIT_CREATED(billName, amount);
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ billSplitId }),
    });
  }

  async notifyPaymentReminder(
    userId: string,
    billName: string,
    amount: number,
    billSplitId?: number,
  ): Promise<Notification> {
    const template = NotificationTemplates.BILL_SPLIT_PAYMENT_REMINDER(billName, amount);
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ billSplitId }),
    });
  }

  async notifyBillSplitPaymentReceived(
    userId: string,
    payerName: string,
    amount: number,
    billName: string,
    billSplitId?: number,
  ): Promise<Notification> {
    return await this.createNotification({
      userId,
      title: "Pago recibido",
      message: `${payerName} pagó ${fmtClp(amount)} por "${billName}".`,
      type: "success",
      category: "bill_split",
      actionUrl: "/dividir-cuenta",
      metadata: JSON.stringify({ billSplitId, payerName, amount }),
    });
  }

  async notifyCreditScoreChange(
    userId: string,
    newScore: number,
    oldScore: number,
  ): Promise<Notification> {
    const change = newScore - oldScore;
    const template = NotificationTemplates.CREDIT_SCORE_UPDATED(newScore, change);
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ newScore, oldScore, change }),
    });
  }

  async notifyGoalMilestone(
    userId: string,
    goalName: string,
    progress: number,
    goalId?: number,
  ): Promise<Notification> {
    const template = NotificationTemplates.GOAL_MILESTONE(goalName, progress);
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ goalId, progress }),
    });
  }

  async notifyGoalCreated(
    userId: string,
    goalName: string,
    goalId?: number,
  ): Promise<Notification> {
    const template = NotificationTemplates.GOAL_CREATED(goalName);
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ goalId }),
    });
  }

  async notifyUnusualExpense(
    userId: string,
    amount: number,
    category: string,
    expenseId?: number,
  ): Promise<Notification> {
    const template = NotificationTemplates.EXPENSE_UNUSUAL(
      amount,
      expenseCategoryLabelEs(category),
    );
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ expenseId, amount, category }),
    });
  }

  async notifySecurityLogin(userId: string, location: string): Promise<Notification> {
    const template = NotificationTemplates.SECURITY_LOGIN(location);
    return await this.createNotification({
      userId,
      ...template,
      metadata: JSON.stringify({ location, timestamp: new Date().toISOString() }),
    });
  }
}

export const notificationService = new NotificationServiceImpl();
