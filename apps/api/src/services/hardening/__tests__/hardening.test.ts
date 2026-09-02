import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff, backoffDelay } from "../retry";
import { redactPii, redactRut, redactEmail, isPiiKey } from "../piiSafe";

describe("retryWithBackoff", () => {
  const noSleep = async () => {};

  it("devuelve al primer intento si no falla", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await retryWithBackoff(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta y termina bien tras fallos transitorios", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("transient");
      return "ok";
    });
    expect(await retryWithBackoff(fn, { attempts: 3, sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("agota los intentos y lanza el último error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(retryWithBackoff(fn, { attempts: 2, sleep: noSleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("no reintenta errores marcados como NO reintentables", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      retryWithBackoff(fn, { attempts: 5, sleep: noSleep, retryable: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backoff es exponencial y acotado (sin jitter)", () => {
    const cfg = { baseDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: false };
    expect(backoffDelay(1, cfg, () => 0)).toBe(100);
    expect(backoffDelay(2, cfg, () => 0)).toBe(200);
    expect(backoffDelay(3, cfg, () => 0)).toBe(400);
    expect(backoffDelay(10, cfg, () => 0)).toBe(1000); // topado
  });
});

describe("redactPii", () => {
  it("enmascara claves sensibles, preservando el resto", () => {
    const out = redactPii({
      rut: "12.345.678-9",
      email: "camila@correo.cl",
      password: "secreto",
      clave: "1234",
      monthlyClp: 1_650_000,
      nested: { token: "abc", ok: true },
    });
    expect(out.rut).toBe("***-9");
    expect(out.email).toBe("c***@correo.cl");
    expect(out.password).toBe("[redacted]");
    expect(out.clave).toBe("[redacted]");
    expect(out.monthlyClp).toBe(1_650_000);
    expect((out.nested as { token: string; ok: boolean }).token).toBe("[redacted]");
    expect((out.nested as { ok: boolean }).ok).toBe(true);
  });

  it("recorre arrays y no muta el original", () => {
    const src = { items: [{ password: "x" }, { email: "a@b.cl" }] };
    const out = redactPii(src);
    expect(out.items[0].password).toBe("[redacted]");
    expect(src.items[0].password).toBe("x"); // intacto
  });

  it("helpers: redactRut / redactEmail / isPiiKey", () => {
    expect(redactRut("12.345.678-9")).toBe("***-9");
    expect(redactRut("99")).toBe("***9");
    expect(redactEmail("thomas@coda.cl")).toBe("t***@coda.cl");
    expect(isPiiKey("passwordHash")).toBe(true);
    expect(isPiiKey("monthlyClp")).toBe(false);
  });
});
