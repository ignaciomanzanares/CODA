import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { redactForLog } from "../piiSafe";
import { loggerFormatters } from "../../../logger";

describe("redactForLog — política para logs", () => {
  it("enmascara strings bajo claves sensibles", () => {
    const out = redactForLog({ email: "camila@correo.cl", rut: "12.345.678-5", password: "x" });
    expect(out).toEqual({ email: "c***@correo.cl", rut: "***-5", password: "[redacted]" });
  });

  it("deja Errors, flags y contadores aunque la clave suene sensible", () => {
    const err = new Error("smtp caído");
    const out = redactForLog({ emailError: err, emailSent: true, tokenCount: 12, token: null });
    expect(out.emailError).toBe(err);
    expect(out.emailSent).toBe(true);
    expect(out.tokenCount).toBe(12);
    expect(out.token).toBeNull();
  });

  it("borra objetos completos bajo clave sensible y recorre los no sensibles", () => {
    const at = new Date("2026-09-16T12:00:00Z");
    const src = { credentials: { user: "u", pass: "p" }, ctx: { participantEmail: "a@b.cl", at } };
    const out = redactForLog(src);
    expect(out.credentials).toBe("[redacted]");
    expect(out.ctx.participantEmail).toBe("a***@b.cl");
    expect(out.ctx.at).toBe(at); // Date intacta
    expect(src.ctx.participantEmail).toBe("a@b.cl"); // no muta el original
  });
});

describe("logger de producción — no escribe PII en claro", () => {
  const capture = () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const log = pino({ formatters: loggerFormatters, base: undefined }, stream);
    return { log, lines: () => chunks.map((c) => JSON.parse(c)) };
  };

  it("enmascara email y RUT pasados en claro (caso real: bill splits, links de pago)", () => {
    const { log, lines } = capture();
    log.info({ userId: "u1", email: "persona@correo.cl", emailSent: true }, "Created new user");
    log.warn({ rut: "12.345.678-5" }, "Invalid RUT in transfer details");

    const [a, b] = lines();
    expect(JSON.stringify([a, b])).not.toContain("persona@correo.cl");
    expect(JSON.stringify([a, b])).not.toContain("12.345.678-5");
    expect(a.email).toBe("p***@correo.cl");
    expect(a.emailSent).toBe(true);
    expect(a.userId).toBe("u1");
    expect(b.rut).toBe("***-5");
  });

  it("no rompe la serialización de errores en `err`", () => {
    const { log, lines } = capture();
    log.error({ err: new Error("boom") }, "falló");
    const [line] = lines();
    expect(line.err.message).toBe("boom");
    expect(line.err.stack).toContain("Error: boom");
  });
});
