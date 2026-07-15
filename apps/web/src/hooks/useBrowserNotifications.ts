import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/types";

/**
 * Requests browser Notification permission and shows a native notification
 * when a new unread notification arrives from the server.
 */
export function useBrowserNotifications() {
  const { isAuthenticated } = useAuth();
  const { getNotifications } = useApi();
  const lastSeenIdRef = useRef<number>(0);
  const hasRequestedRef = useRef(false);

  // Request permission once
  useEffect(() => {
    if (hasRequestedRef.current || !isAuthenticated) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    hasRequestedRef.current = true;
  }, [isAuthenticated]);

  // Poll for unread notifications
  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["notifications", "browser-push-poll"],
    queryFn: () => getNotifications({ unreadOnly: true }),
    enabled: isAuthenticated,
    refetchInterval: 60_000, // poll every minute
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!notifications?.length) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    for (const n of notifications) {
      const id = typeof n.id === "number" ? n.id : Number(n.id);
      if (id > lastSeenIdRef.current) {
        new Notification(n.title ?? "CODA", {
          body: String(n.message ?? ""),
          icon: "/icons/icon-192x192.png",
          tag: `coda-notif-${id}`,
        });
      }
    }

    // Update last seen to highest id
    const maxId = Math.max(
      ...notifications.map((n) => (typeof n.id === "number" ? n.id : Number(n.id))),
    );
    if (maxId > lastSeenIdRef.current) {
      lastSeenIdRef.current = maxId;
    }
  }, [notifications]);
}
