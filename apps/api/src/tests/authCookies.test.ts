import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  authenticate,
  handleLoginWithDB,
  handleRegister,
  handleVerify2FA,
  handleLogout,
  handleDeleteAccount,
  ensureUserForToken,
  generateToken,
  hashPassword,
  storeOTP,
} from "../middleware/auth.js";
import {
  getAuthCookieOptions,
  getAuthCookieName,
  isAuthCookieEnabled,
} from "../middleware/authCookie.js";
import { storage } from "../storage.js";

/**
 * PR #12 — auth cookie foundation (Fase A, backwards-compatible).
 *
 * With AUTH_COOKIE_ENABLED unset/false: no Set-Cookie, token still in JSON,
 * Bearer auth unchanged (= identical to current prod). With the flag on: token
 * endpoints set an httpOnly cookie, logout clears it, and `authenticate` accepts
 * the cookie as a fallback to Bearer (Bearer keeps strict priority).
 */

const COOKIE = "coda_session";

function uid(p: string) {
  return `${p}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function makeReq(opts: {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  query?: Record<string, string>;
  user?: { userId: string; email?: string };
}): any {
  return {
    body: opts.body ?? {},
    headers: opts.headers ?? {},
    cookies: opts.cookies ?? {},
    query: opts.query ?? {},
    socket: {},
    user: opts.user,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, cookies: [], cleared: [] };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (p: any) => {
    res.body = p;
    return res;
  };
  res.cookie = (name: string, value: string, options: any) => {
    res.cookies.push({ name, value, options });
    return res;
  };
  res.clearCookie = (name: string, options: any) => {
    res.cleared.push({ name, options });
    return res;
  };
  return res;
}

async function seedUser(email: string, password: string, extra: Record<string, unknown> = {}) {
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

const ENV_KEYS = [
  "NODE_ENV",
  "AUTH_COOKIE_ENABLED",
  "AUTH_COOKIE_NAME",
  "AUTH_COOKIE_SECURE",
  "AUTH_COOKIE_SAMESITE",
  "AUTH_COOKIE_DOMAIN",
  "DEMO_MODE",
] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("auth cookie options/config", () => {
  it("defaults: httpOnly, secure, SameSite=Lax, path=/, positive maxAge, no domain", () => {
    const o = getAuthCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.secure).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(typeof o.maxAge).toBe("number");
    expect(o.maxAge as number).toBeGreaterThan(0);
    expect(o.domain).toBeUndefined();
  });

  it("AUTH_COOKIE_DOMAIN empty does NOT add Domain; set value does", () => {
    process.env.AUTH_COOKIE_DOMAIN = "";
    expect(getAuthCookieOptions().domain).toBeUndefined();
    process.env.AUTH_COOKIE_DOMAIN = ".codafinance.cl";
    expect(getAuthCookieOptions().domain).toBe(".codafinance.cl");
  });

  it("SameSite=None forces Secure even if AUTH_COOKIE_SECURE=false", () => {
    process.env.AUTH_COOKIE_SAMESITE = "none";
    process.env.AUTH_COOKIE_SECURE = "false";
    const o = getAuthCookieOptions();
    expect(o.sameSite).toBe("none");
    expect(o.secure).toBe(true);
  });

  it("invalid SameSite falls back to lax; dev can opt out of Secure", () => {
    process.env.AUTH_COOKIE_SAMESITE = "bogus";
    process.env.AUTH_COOKIE_SECURE = "false";
    const o = getAuthCookieOptions();
    expect(o.sameSite).toBe("lax");
    expect(o.secure).toBe(false);
  });

  it("isAuthCookieEnabled reflects the flag; getAuthCookieName respects override", () => {
    expect(isAuthCookieEnabled()).toBe(false);
    process.env.AUTH_COOKIE_ENABLED = "true";
    expect(isAuthCookieEnabled()).toBe(true);
    expect(getAuthCookieName()).toBe(COOKIE);
    process.env.AUTH_COOKIE_NAME = "custom_sess";
    expect(getAuthCookieName()).toBe("custom_sess");
  });
});

describe("token endpoints set/skip cookie by flag", () => {
  it("flag OFF: login sets NO cookie but still returns token JSON", async () => {
    const email = uid("off") + "@coda.test";
    await seedUser(email, "Pass1234!");
    const res = makeRes();
    await handleLoginWithDB(makeReq({ body: { email, password: "Pass1234!" } }), res);
    expect(res.body?.token).toBeTruthy();
    expect(res.cookies.length).toBe(0);
  });

  it("flag ON: login sets httpOnly coda_session cookie AND returns token JSON", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const email = uid("on") + "@coda.test";
    await seedUser(email, "Pass1234!");
    const res = makeRes();
    await handleLoginWithDB(makeReq({ body: { email, password: "Pass1234!" } }), res);
    expect(res.body?.token).toBeTruthy();
    expect(res.cookies.length).toBe(1);
    const c = res.cookies[0];
    expect(c.name).toBe(COOKIE);
    expect(c.value).toBe(res.body.token);
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.path).toBe("/");
    expect(c.options.sameSite).toBe("lax");
  });

  it("flag ON in production: cookie is Secure", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_COOKIE_ENABLED = "true";
    const email = uid("prod") + "@coda.test";
    await seedUser(email, "Pass1234!");
    const res = makeRes();
    await handleLoginWithDB(makeReq({ body: { email, password: "Pass1234!" } }), res);
    expect(res.cookies[0]?.options.secure).toBe(true);
  });

  it("flag ON: register sets the cookie", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const email = uid("reg") + "@coda.test";
    const res = makeRes();
    await handleRegister(
      makeReq({
        body: {
          name: "Reg",
          email,
          password: "Pass1234!",
          consents: { data_processing: true, scoring: true, recommendations: true },
          policyVersion: "1.0",
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.cookies.some((c: any) => c.name === COOKIE)).toBe(true);
  });

  it("flag ON: 2FA verify sets the cookie", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const email = uid("2fa") + "@coda.test";
    await seedUser(email, "Pass1234!", { twoFactorEnabled: 1 });
    await storeOTP(email, "123456");
    const res = makeRes();
    await handleVerify2FA(makeReq({ body: { email, code: "123456" } }), res);
    expect(res.body?.token).toBeTruthy();
    expect(res.cookies.some((c: any) => c.name === COOKIE)).toBe(true);
  });

  it("flag ON: logout clears the cookie", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const res = makeRes();
    await handleLogout(makeReq({ user: { userId: "u-logout", email: "x@y.com" } }), res);
    expect(res.cleared.some((c: any) => c.name === COOKIE)).toBe(true);
  });

  it("flag OFF: logout does not emit a clear-cookie", async () => {
    const res = makeRes();
    await handleLogout(makeReq({ user: { userId: "u-logout", email: "x@y.com" } }), res);
    expect(res.cleared.length).toBe(0);
  });
});

describe("authenticate reads cookie and Bearer", () => {
  async function runAuth(req: any) {
    const res = makeRes();
    let nextCalled = false;
    await authenticate(req, res, () => {
      nextCalled = true;
    });
    return { res, nextCalled, req };
  }
  async function tokenFor(prefix: string) {
    const email = uid(prefix) + "@coda.test";
    const user = await seedUser(email, "Pass1234!");
    return { user, token: generateToken({ userId: user.id, email, name: email, role: "persona" }) };
  }

  // ── flag OFF: cookie transport must be inert (identical to current prod) ──
  it("flag OFF: valid cookie WITHOUT Bearer → 401 (cookie is ignored)", async () => {
    const { token } = await tokenFor("off-ck");
    const { res, nextCalled } = await runAuth(makeReq({ cookies: { [COOKIE]: token } }));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("flag OFF: valid Bearer (+ cookie present) → 200 via Bearer", async () => {
    const { user, token } = await tokenFor("off-br");
    const { nextCalled, req } = await runAuth(
      makeReq({ headers: { authorization: `Bearer ${token}` }, cookies: { [COOKIE]: token } }),
    );
    expect(nextCalled).toBe(true);
    expect(req.user?.userId).toBe(user.id);
  });

  it("flag OFF: invalid cookie does not change behaviour → 401", async () => {
    const { res, nextCalled } = await runAuth(makeReq({ cookies: { [COOKIE]: "garbage" } }));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  // ── flag ON: cookie is an accepted fallback, Bearer keeps strict priority ──
  it("flag ON: valid cookie WITHOUT Bearer → 200", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const { user, token } = await tokenFor("on-ck");
    const { nextCalled, req } = await runAuth(makeReq({ cookies: { [COOKIE]: token } }));
    expect(nextCalled).toBe(true);
    expect(req.user?.userId).toBe(user.id);
  });

  it("flag ON: valid Bearer → 200", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const { user, token } = await tokenFor("on-br");
    const { nextCalled, req } = await runAuth(
      makeReq({ headers: { authorization: `Bearer ${token}` } }),
    );
    expect(nextCalled).toBe(true);
    expect(req.user?.userId).toBe(user.id);
  });

  it("valid JWT for a missing user → 401 and never recreates the account", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const userId = uid("deleted");
    const email = uid("deleted") + "@coda.test";
    const token = generateToken({ userId, email, name: "Deleted User", role: "persona" });

    const { res, nextCalled } = await runAuth(makeReq({ cookies: { [COOKIE]: token } }));

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.cleared.some((c: any) => c.name === COOKIE)).toBe(true);
    expect(await storage.getUserByEmail(email)).toBeUndefined();
  });

  it("ensureUserForToken does not auto-create a generic migration user", async () => {
    const userId = uid("missing-sync");
    const email = uid("missing-sync") + "@coda.test";

    await expect(
      ensureUserForToken({ userId, email, name: "Missing Sync", role: "persona" }),
    ).resolves.toBeNull();
    expect(await storage.getUserByEmail(email)).toBeUndefined();
  });

  it("flag ON: invalid Bearer + valid cookie → 401 (Bearer strict priority, no fallback)", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const { token } = await tokenFor("on-pri");
    const { res, nextCalled } = await runAuth(
      makeReq({
        headers: { authorization: "Bearer not.a.valid.jwt" },
        cookies: { [COOKIE]: token },
      }),
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("flag ON: non-Bearer Authorization (Basic) does NOT fall back to cookie → 401", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const { token } = await tokenFor("basic");
    const { res, nextCalled } = await runAuth(
      makeReq({ headers: { authorization: "Basic dXNlcjpwYXNz" }, cookies: { [COOKIE]: token } }),
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("flag ON: logout via cookie (no Bearer) invalidates the JWT — reuse → 401", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const { user, token } = await tokenFor("logout-ck");
    // Sanity: the cookie authenticates before logout.
    expect((await runAuth(makeReq({ cookies: { [COOKIE]: token } }))).nextCalled).toBe(true);

    // Logout using ONLY the cookie (no Authorization header).
    const logoutRes = makeRes();
    await handleLogout(
      makeReq({ cookies: { [COOKIE]: token }, user: { userId: user.id, email: user.email } }),
      logoutRes,
    );
    expect(logoutRes.cleared.some((c: any) => c.name === COOKIE)).toBe(true);

    // Reusing the same JWT/cookie afterwards must be rejected.
    const after = await runAuth(makeReq({ cookies: { [COOKIE]: token } }));
    expect(after.nextCalled).toBe(false);
    expect(after.res.statusCode).toBe(401);
  });

  it("never accepts a token via query param (flag on or off)", async () => {
    const { token } = await tokenFor("q");
    expect((await runAuth(makeReq({ query: { token } }))).nextCalled).toBe(false);
    process.env.AUTH_COOKIE_ENABLED = "true";
    expect((await runAuth(makeReq({ query: { token } }))).nextCalled).toBe(false);
  });

  it("delete account revokes cookie, clears it, and blocks in-flight/old JWT recreation", async () => {
    process.env.AUTH_COOKIE_ENABLED = "true";
    const email = uid("delete-flow") + "@coda.test";
    const user = await seedUser(email, "Pass1234!");
    const currentToken = generateToken({
      userId: user.id,
      email,
      name: "Current",
      role: "persona",
    });
    const otherToken = generateToken({
      userId: user.id,
      email,
      name: "Other device",
      role: "persona",
    });

    const deleteReq = makeReq({ cookies: { [COOKIE]: currentToken } });
    const before = await runAuth(deleteReq);
    expect(before.nextCalled).toBe(true);

    const deleteRes = makeRes();
    let deleteError: unknown;
    await handleDeleteAccount(before.req, deleteRes, (error?: unknown) => {
      deleteError = error;
    });

    expect(deleteError).toBeUndefined();
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body?.message).toBe("Account deleted successfully");
    expect(deleteRes.cleared.some((c: any) => c.name === COOKIE)).toBe(true);
    expect(await storage.getUser(user.id)).toBeUndefined();

    const reusedCookie = await runAuth(makeReq({ cookies: { [COOKIE]: currentToken } }));
    expect(reusedCookie.nextCalled).toBe(false);
    expect(reusedCookie.res.statusCode).toBe(401);

    // Simulates another device or a request already queued with a distinct valid JWT.
    const backgroundRequest = await runAuth(
      makeReq({ headers: { authorization: `Bearer ${otherToken}` } }),
    );
    expect(backgroundRequest.nextCalled).toBe(false);
    expect(backgroundRequest.res.statusCode).toBe(401);
    expect(await storage.getUserByEmail(email)).toBeUndefined();
  });
});
