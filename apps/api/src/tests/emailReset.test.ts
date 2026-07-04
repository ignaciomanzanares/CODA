import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { handleLoginWithDB, hashPassword } from "../middleware/auth.js";
import { emailService, isEmailConfigured } from "../services/emailService.js";
import { storage } from "../storage.js";

/**
 * Email / 2FA readiness (pre DEMO_MODE=false).
 *
 * Covers the real change in this PR: `hasEmailConfig` in the 2FA login path now
 * uses the centralized `isEmailConfigured()` (which includes Resend), so 2FA no
 * longer fails closed when only Resend is configured. Also asserts the
 * fail-closed behaviour stays intact and demo123 can't bypass a 2FA account.
 *
 * forgot-password / reset-password are HTTP route closures (no supertest in the
 * repo); their flow is exercised by the production smoke. This file unit-tests
 * the exported building blocks instead.
 */

const DEMO_PW = "demo123";

function uid(p: string) {
  return `${p}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
function makeReq(body: Record<string, unknown>): any {
  return { body, headers: {}, socket: {} };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (p: any) => { res.body = p; return res; };
  return res;
}
async function login(email: string, password: string) {
  const res = makeRes();
  await handleLoginWithDB(makeReq({ email, password }), res);
  return res;
}
async function seed2FAUser(email: string, password: string) {
  return storage.createUser({
    id: uid("u2fa"),
    email,
    username: email,
    passwordHash: hashPassword(password),
    twoFactorEnabled: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

const ENV_KEYS = [
  "NODE_ENV",
  "DEMO_MODE",
  "DEMO_ALLOWED_EMAILS",
  "DEMO_EMAIL",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isEmailConfigured", () => {
  it("false when no provider is set", () => {
    expect(isEmailConfigured()).toBe(false);
  });
  it("true with RESEND_API_KEY (preferred provider — the bug this PR fixes)", () => {
    process.env.RESEND_API_KEY = "re_test_123";
    expect(isEmailConfigured()).toBe(true);
  });
  it("true with Gmail app password", () => {
    process.env.GMAIL_USER = "x@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "app-pass";
    expect(isEmailConfigured()).toBe(true);
  });
  it("false with partial Gmail config", () => {
    process.env.GMAIL_USER = "x@gmail.com";
    expect(isEmailConfigured()).toBe(false);
  });
  it("true with SMTP host + user", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("2FA login gating (email readiness)", () => {
  it("with email configured (Resend), a 2FA account requires OTP and gets NO direct token", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_test_123"; // isEmailConfigured() -> true via Resend
    const sendSpy = vi.spyOn(emailService, "send2FACode").mockResolvedValue(true);
    const email = uid("twofa") + "@coda.test";
    await seed2FAUser(email, "RealPass123!");

    const res = await login(email, "RealPass123!");

    expect(res.body?.requires2FA).toBe(true);
    expect(res.body?.token).toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("with NO email provider in production, a 2FA account fails closed (503), no OTP sent", async () => {
    process.env.NODE_ENV = "production";
    // no RESEND/GMAIL/SMTP -> isEmailConfigured() false
    const sendSpy = vi.spyOn(emailService, "send2FACode").mockResolvedValue(true);
    const email = uid("twofa") + "@coda.test";
    await seed2FAUser(email, "RealPass123!");

    const res = await login(email, "RealPass123!");

    expect(res.statusCode).toBe(503);
    expect(res.body?.token).toBeUndefined();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("demo123 cannot bypass a 2FA account (not allowlisted)", async () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_MODE = "true";
    process.env.DEMO_ALLOWED_EMAILS = "demo@example.com";
    process.env.RESEND_API_KEY = "re_test_123";
    vi.spyOn(emailService, "send2FACode").mockResolvedValue(true);
    const email = uid("twofa") + "@coda.test";
    await seed2FAUser(email, "RealPass123!");

    const res = await login(email, DEMO_PW);

    expect(res.statusCode).toBe(401);
    expect(res.body?.token).toBeUndefined();
  });
});
