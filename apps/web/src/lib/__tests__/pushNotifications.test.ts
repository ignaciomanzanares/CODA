import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTestPush } from "../pushNotifications";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
});

describe("pushNotifications", () => {
  it("envia el push de prueba con header CSRF cuando existe cookie", async () => {
    (globalThis as { document?: { cookie: string } }).document = { cookie: "coda_csrf=csrf123" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, devicesSent: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(sendTestPush()).resolves.toEqual({ ok: true, devicesSent: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/push\/test$/),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf123",
        },
      })
    );
  });

  it("devuelve cero dispositivos cuando el backend no envio a ningun endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, devicesSent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(sendTestPush()).resolves.toEqual({ ok: true, devicesSent: 0 });
  });
});
