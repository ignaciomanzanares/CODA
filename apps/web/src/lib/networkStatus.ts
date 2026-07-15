import { USER_FACING_CONNECTION_ERROR } from "@/lib/userFacingErrors";

type NavigatorOnlineLike = Pick<Navigator, "onLine">;

export function isBrowserOffline(
  nav: NavigatorOnlineLike | undefined = typeof navigator === "undefined" ? undefined : navigator,
) {
  return typeof nav?.onLine === "boolean" ? !nav.onLine : false;
}

export function assertBrowserOnline() {
  if (isBrowserOffline()) {
    throw new Error(USER_FACING_CONNECTION_ERROR);
  }
}
