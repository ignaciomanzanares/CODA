import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../apiFetch";
import { USER_FACING_CONNECTION_ERROR } from "../userFacingErrors";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

describe("apiFetch", () => {
  it("falla de inmediato offline sin intentar fetch", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: USER_FACING_CONNECTION_ERROR,
    } satisfies Partial<ApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
