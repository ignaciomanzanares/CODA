import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { csrfOriginCheck, csrfAllowedOrigins } from "../middleware/csrf.js";

/**
 * CSRF-1: Origin/Referer allowlist for cookie-authenticated mutations.
 * Tested as a pure middleware (no DB) with mock req/res/next and env control.
 */

const ALLOWED = "https://www.codafinance.cl";

function makeReq(opts: {
  method?: string;
  path?: string;
  origin?: string;
  referer?: string;
  authorization?: string;
  cookie?: boolean;
}): any {
  const headers: Record<string, string> = {};
  if (opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.referer !== undefined) headers.referer = opts.referer;
  if (opts.authorization !== undefined) headers.authorization = opts.authorization;
  return {
    method: opts.method ?? "POST",
    path: opts.path ?? "/api/expenses",
    headers,
    cookies: opts.cookie === false ? {} : { coda_session: "jwt.value.here" },
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (p: any) => {
    res.body = p;
    return res;
  };
  return res;
}

function run(req: any): { nextCalled: boolean; res: any } {
  const res = makeRes();
  let nextCalled = false;
  csrfOriginCheck(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, res };
}

const ENV_KEYS = ["CSRF_ENFORCE", "CORS_ORIGINS"] as const;
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

describe("csrfAllowedOrigins", () => {
  it("includes own domains + dev; merges CORS_ORIGINS; exact match only", () => {
    process.env.CORS_ORIGINS = "https://staging.codafinance.cl";
    const allow = csrfAllowedOrigins();
    expect(allow.has("https://www.codafinance.cl")).toBe(true);
    expect(allow.has("https://codafinance.cl")).toBe(true);
    expect(allow.has("http://localhost:5173")).toBe(true);
    expect(allow.has("https://staging.codafinance.cl")).toBe(true);
    expect(allow.has("https://evil.com")).toBe(false);
  });
});

describe("csrfOriginCheck with CSRF_ENFORCE=true", () => {
  beforeEach(() => {
    process.env.CSRF_ENFORCE = "true";
  });

  it("1. cookie-auth mutation with allowlisted Origin → passes", () => {
    expect(run(makeReq({ origin: ALLOWED })).nextCalled).toBe(true);
  });

  it("2. cookie-auth mutation without Origin/Referer → 403", () => {
    const { nextCalled, res } = run(makeReq({}));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body?.message).toBe("CSRF validation failed");
  });

  it("3. cookie-auth mutation with foreign Origin → 403", () => {
    const { nextCalled, res } = run(makeReq({ origin: "https://evil.com" }));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("4. cookie-auth mutation with allowlisted Referer (no Origin) → passes", () => {
    expect(run(makeReq({ referer: `${ALLOWED}/panel` })).nextCalled).toBe(true);
  });

  it('5. Origin "null" is treated as absent → 403', () => {
    expect(run(makeReq({ origin: "null" })).res.statusCode).toBe(403);
  });

  it("6. Bearer-auth mutation (no Origin) → passes (CSRF-safe header)", () => {
    expect(run(makeReq({ authorization: "Bearer abc.def.ghi" })).nextCalled).toBe(true);
  });

  it("7. mutation without session cookie → passes (not cookie-auth)", () => {
    expect(run(makeReq({ cookie: false })).nextCalled).toBe(true);
  });

  it("8. GET with cookie and no Origin → passes (safe method)", () => {
    expect(run(makeReq({ method: "GET", path: "/api/transactions/summary" })).nextCalled).toBe(
      true,
    );
  });

  it("9. auth-bootstrap (login/register/reset/2fa-verify) → passes without Origin", () => {
    for (const p of [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/recover-migration-password",
      "/api/auth/2fa/verify",
      "/api/auth/2fa/resend",
    ]) {
      expect(run(makeReq({ path: p })).nextCalled).toBe(true);
    }
  });

  it("10. public (utils/share) and empresas paths → passes without Origin", () => {
    expect(run(makeReq({ path: "/api/utils/credit-score" })).nextCalled).toBe(true);
    expect(run(makeReq({ path: "/api/share/abc123/pay" })).nextCalled).toBe(true);
    expect(run(makeReq({ path: "/api/empresas/documents" })).nextCalled).toBe(true);
  });

  it("11. enforced auth mutations (logout, 2fa/enable) ARE checked → 403 without Origin", () => {
    expect(run(makeReq({ path: "/api/auth/logout" })).res.statusCode).toBe(403);
    expect(run(makeReq({ path: "/api/auth/2fa/enable" })).res.statusCode).toBe(403);
  });
});

describe("csrfOriginCheck flag off (default)", () => {
  it("flag false: cookie-auth mutation without Origin → passes (inert)", () => {
    // CSRF_ENFORCE unset → not "true"
    expect(run(makeReq({})).nextCalled).toBe(true);
  });
  it("flag false: foreign Origin → still passes (no behaviour change)", () => {
    expect(run(makeReq({ origin: "https://evil.com" })).nextCalled).toBe(true);
  });
});
