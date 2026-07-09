import { API_BASE_URL } from "./apiBase";
import { withCsrfHeader } from "./csrf";
import { isBrowserOffline } from "./networkStatus";

export interface TestPushResult {
  ok: boolean;
  devicesSent: number;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function getVapidPublicKey(): Promise<string | null> {
  if (isBrowserOffline()) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/push/vapid-key`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || null;
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (isBrowserOffline()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      console.warn("VAPID key not available");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeader("POST", {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return res.ok;
  } catch (err) {
    console.error("Failed to subscribe to push:", err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (isBrowserOffline()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    await fetch(`${API_BASE_URL}/push/unsubscribe`, {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeader("POST", {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
    return true;
  } catch (err) {
    console.error("Failed to unsubscribe from push:", err);
    return false;
  }
}

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

export async function sendTestPush(): Promise<TestPushResult> {
  if (isBrowserOffline()) return { ok: false, devicesSent: 0 };

  try {
    const res = await fetch(`${API_BASE_URL}/push/test`, {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeader("POST", {
        "Content-Type": "application/json",
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      devicesSent: typeof data.devicesSent === "number" ? data.devicesSent : 0,
    };
  } catch {
    return { ok: false, devicesSent: 0 };
  }
}
