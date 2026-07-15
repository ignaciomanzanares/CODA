import webpush from "web-push";
import { db, pushSubscriptions } from "../db/index.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@coda.cl";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  logger.info("Web Push VAPID keys configured");
} else {
  logger.warn(
    "VAPID keys not set — push notifications disabled. Generate with: npx web-push generate-vapid-keys",
  );
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(pushSubscriptions)
        .set({ userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    } else {
      await db.insert(pushSubscriptions).values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to save push subscription");
    throw err;
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  try {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  } catch (err) {
    logger.error({ err }, "Failed to remove push subscription");
  }
}

export async function removeSubscriptionsForUser(userId: string): Promise<void> {
  try {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  } catch (err) {
    logger.error({ err }, "Failed to remove user push subscriptions");
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 0;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return 0;

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/favicon.svg",
    badge: payload.badge || "/favicon.svg",
    tag: payload.tag,
    data: {
      url: payload.url || "/",
      ...payload.data,
    },
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
        { TTL: 60 * 60 * 24 },
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        logger.info({ endpoint: sub.endpoint }, "Push subscription expired, removing");
        await removeSubscription(sub.endpoint);
      } else {
        logger.warn({ err, endpoint: sub.endpoint }, "Failed to send push notification");
      }
    }
  }

  return sent;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
