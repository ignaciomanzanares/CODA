/**
 * useKeepAlive
 *
 * Sends a lightweight HEAD request to the API every 14 minutes to prevent
 * Render free-tier from sleeping the server (sleeps after ~15 min idle).
 *
 * Only pings while the tab is visible (no wasted requests in background).
 * Uses HEAD to minimize bandwidth — no body transferred.
 */

import { useEffect } from "react";

const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes
const PING_URL = "/api/auth/me"; // lightweight authenticated endpoint (401 is fine, keeps server alive)

export function useKeepAlive() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      if (document.hidden) return;
      fetch(PING_URL, { method: "HEAD", credentials: "include" }).catch(() => {
        // Silently ignore — purpose is just to keep Render awake
      });
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(ping, PING_INTERVAL_MS);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        ping(); // Ping immediately when tab becomes visible (might have been sleeping)
        start();
      }
    };

    // Start immediately
    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
