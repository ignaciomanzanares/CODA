import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  handleLoginWithDB,
  handleRegister,
  hashPassword,
  isDemoAllowedEmail,
} from "../middleware/auth.js";
import { storage } from "../storage.js";
import { db, eq, users, privacyConsentEvents } from "../db/index.js";

/**
 * PR A — restrict demo login to allowlisted accounts.
 *
 * Hardens the bug found in the audit: with DEMO_MODE=true, `demo123` + any email
 * authenticated that account (real accounts included) without checking the real
 * password, and auto-created users for unknown emails. Now `demo123` only works
 * for emails in DEMO_ALLOWED_EMAILS / DEMO_EMAIL (default demo@example.com).
 *
 * Runs against the SQLite test DB. We drive the prod code path by setting
 * NODE_ENV=production per test (and restoring it), so the demo branch is gated
 * by DEMO_MODE exactly as in production.
 */

const DEMO_PW = "demo123";

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function makeReq(body: Record<string, unknown>): any {
  return { body, headers: {}, socket: {} };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: any) => {
    res.body = payload;
    return res;
  };
  return res;
}

async function login(email: string, password: string) {
  const res = makeRes();
  await handleLoginWithDB(makeReq({ email, password }), res);
  return res;
}

async function seedRealUser(email: string, password: string, extra: Record<string, unknown> = {}) {
  return storage.createUser({
    id: uid("u"),
    email,
    username: email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  } as any);
}

// --- env management: restore everything we touch ----------------------------
const ENV_KEYS = [
  "NODE_ENV",
  "DEMO_MODE",
  "DEMO_ALLOWED_EMAILS",
  "DEMO_EMAIL",
  "DEMO_PASSWORD",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "SMTP_HOST",
  "SMTP_USER",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function prodDemoOn(allowed: string) {
  process.env.NODE_ENV = "production";
  process.env.DEMO_MODE = "true";
  process.env.DEMO_ALLOWED_EMAILS = allowed;
  delete process.env.DEMO_EMAIL;
  delete process.env.DEMO_PASSWORD; // default demo123
}

describe("demo login allowlist (DEMO_MODE hardening)", () => {
  it("1. demo123 does NOT authenticate a real account (not allowlisted)", async () => {
    prodDemoOn("demo@example.com");
    const email = uid("real") + "@coda.test";
    await seedRealUser(email, "RealPass123!");

    const res = await login(email, DEMO_PW);

    expect(res.statusCode).toBe(401);
    expect(res.body?.token).toBeUndefined();
  });

  it("2. real account logs in with its real password", async () => {
    prodDemoOn("demo@example.com");
    const email = uid("real") + "@coda.test";
    await seedRealUser(email, "RealPass123!");

    const res = await login(email, "RealPass123!");

    expect(res.statusCode).toBe(200);
    expect(res.body?.token).toBeTruthy();
    expect(res.body?.user?.email).toBe(email);
  });

  it("3. allowlisted demo email logs in with demo123 (uses/creates demo user)", async () => {
    const demoEmail = uid("demo-allow") + "@example.com";
    prodDemoOn(demoEmail);

    const res = await login(demoEmail, DEMO_PW);

    expect(res.statusCode).toBe(200);
    expect(res.body?.token).toBeTruthy();
    expect(await storage.getUserByEmail(demoEmail)).toBeTruthy();
  });

  it("4. demo123 for a non-allowlisted unknown email is rejected and does NOT auto-create", async () => {
    prodDemoOn("demo@example.com");
    const email = uid("ghost") + "@coda.test";

    const res = await login(email, DEMO_PW);

    expect(res.statusCode).toBe(401);
    expect(await storage.getUserByEmail(email)).toBeUndefined();
  });

  it("5. with DEMO_MODE=false, demo123 never works; only the real password does", async () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_MODE = "false";
    const email = uid("demo-off") + "@example.com";
    process.env.DEMO_ALLOWED_EMAILS = email; // even allowlisted, demo is OFF
    await seedRealUser(email, "Secret123!");

    expect((await login(email, DEMO_PW)).statusCode).toBe(401);

    const ok = await login(email, "Secret123!");
    expect(ok.statusCode).toBe(200);
    expect(ok.body?.token).toBeTruthy();
  });

  it("6. register still creates a real user with hashed password + consent events", async () => {
    process.env.NODE_ENV = "production";
    const email = uid("reg") + "@coda.test";
    const res = makeRes();
    await handleRegister(
      makeReq({
        name: "Reg Test",
        email,
        password: "RegPass123!",
        consents: { data_processing: true, scoring: true, recommendations: true },
        policyVersion: "1.0",
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(res.body?.token).toBeTruthy();
    const user = await storage.getUserByEmail(email);
    expect(user?.passwordHash).toBeTruthy();
    const consents = await db
      .select()
      .from(privacyConsentEvents)
      .where(eq(privacyConsentEvents.userId, user!.id));
    expect(consents.length).toBe(3);
  });

  it("7. 2FA path is unchanged: demo123 cannot bypass a 2FA account; real password reaches 2FA (fail-closed)", async () => {
    prodDemoOn("demo@example.com");
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    const email = uid("twofa") + "@coda.test";
    await seedRealUser(email, "RealPass123!", { twoFactorEnabled: 1 });

    // demo123 must not bypass the account.
    expect((await login(email, DEMO_PW)).statusCode).toBe(401);

    // real password reaches the 2FA branch; with no email config in prod it fails closed (503).
    const res = await login(email, "RealPass123!");
    expect(res.statusCode).toBe(503);
    expect(res.body?.token).toBeUndefined();
  });

  it("isDemoAllowedEmail: respects allowlist, DEMO_EMAIL and default", () => {
    process.env.DEMO_ALLOWED_EMAILS = "a@x.com, B@X.com";
    expect(isDemoAllowedEmail("a@x.com")).toBe(true);
    expect(isDemoAllowedEmail("b@x.com")).toBe(true); // normalized
    expect(isDemoAllowedEmail("c@x.com")).toBe(false);

    delete process.env.DEMO_ALLOWED_EMAILS;
    process.env.DEMO_EMAIL = "only@demo.com";
    expect(isDemoAllowedEmail("only@demo.com")).toBe(true);
    expect(isDemoAllowedEmail("a@x.com")).toBe(false);

    delete process.env.DEMO_EMAIL;
    expect(isDemoAllowedEmail("demo@example.com")).toBe(true); // default
    expect(isDemoAllowedEmail("someone@else.com")).toBe(false);
  });
});
