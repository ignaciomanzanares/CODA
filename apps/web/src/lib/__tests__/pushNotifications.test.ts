import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTestPush } from "../pushNotifications";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { navigator?: unknown }).navigator;
});

describe("pushNotifications", () => {
  it("envia el push de prueba con header CSRF cuando existe cookie", async () => {
    (globalThis as { document?: { cookie: string } }).document = { cookie: "coda_csrf=csrf123" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, devicesSent: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
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
      }),
    );
  });

  it("devuelve cero dispositivos cuando el backend no envio a ningun endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, devicesSent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(sendTestPush()).resolves.toEqual({ ok: true, devicesSent: 0 });
  });

  it("no intenta enviar push de prueba cuando el navegador esta offline", async () => {
    (globalThis as { navigator?: { onLine: boolean } }).navigator = { onLine: false };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(sendTestPush()).resolves.toEqual({ ok: false, devicesSent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
