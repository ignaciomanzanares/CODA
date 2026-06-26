import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import {
  authenticate,
  generateToken,
  issueSession,
  handleLogout,
  setAuthCookie,
  clearAuthCookie,
  setCsrfCookie,
  clearCsrfCookie,
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  type AuthenticatedRequest,
  type TokenPayload,
} from '../auth.js';
import { storage } from '../../storage.js';

/** Fake mínimo de Response que captura las cookies seteadas y el body de res.json. */
function fakeRes() {
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  const cleared: string[] = [];
  let statusCode = 200;
  let jsonBody: unknown;
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies[name] = { value, options };
      return res;
    },
    clearCookie(name: string, _options: Record<string, unknown>) {
      cleared.push(name);
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    },
    cookies,
    cleared,
  } as unknown as Response & {
    cookies: typeof cookies;
    cleared: string[];
    statusCode: number;
    jsonBody: unknown;
  };
  return res;
}

function fakeReq(opts: { headers?: Record<string, string>; method?: string } = {}): AuthenticatedRequest {
  return {
    headers: opts.headers ?? {},
    method: opts.method ?? 'GET',
  } as unknown as AuthenticatedRequest;
}

function cookieHeader(...pairs: Array<[string, string]>): string {
  return pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
}

describe('sesión híbrida: cookie httpOnly + CSRF doble-submit', () => {
  const email = 'cookie-auth-test@example.com';
  let userId: string;

  beforeAll(async () => {
    let user = await storage.getUserByEmail(email);
    if (!user) {
      user = await storage.createUser({
        id: crypto.randomUUID(),
        email,
        username: 'cookie_auth_test',
        passwordHash: 'x:x',
        displayName: 'Cookie Test',
        role: 'persona',
      });
    }
    userId = user.id;
  });

  function payload(): TokenPayload {
    return { userId, email, name: 'Cookie Test', role: 'persona' };
  }

  it('issueSession setea cookie httpOnly de sesión + cookie CSRF, y devuelve token+user en el body', () => {
    const res = fakeRes();
    issueSession(res, payload());

    expect(res.cookies[AUTH_COOKIE_NAME]).toBeDefined();
    expect((res.cookies[AUTH_COOKIE_NAME].options as { httpOnly?: boolean }).httpOnly).toBe(true);
    expect(res.cookies[CSRF_COOKIE_NAME]).toBeDefined();
    expect((res.cookies[CSRF_COOKIE_NAME].options as { httpOnly?: boolean }).httpOnly).toBe(false);

    const body = res.jsonBody as { success: boolean; token: string; user: TokenPayload };
    expect(body.success).toBe(true);
    expect(typeof body.token).toBe('string');
    expect(body.user.email).toBe(email);
  });

  it('authenticate acepta el token vía Authorization header (sin exigir CSRF) en una request mutante', async () => {
    const token = generateToken(payload());
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` }, method: 'POST' });
    const res = fakeRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.email).toBe(email);
  });

  it('authenticate acepta el token vía cookie en una request GET sin exigir CSRF', async () => {
    const token = generateToken(payload());
    const req = fakeReq({ headers: { cookie: cookieHeader([AUTH_COOKIE_NAME, token]) }, method: 'GET' });
    const res = fakeRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.email).toBe(email);
  });

  it('authenticate rechaza (403) una request POST autenticada solo por cookie sin el header CSRF', async () => {
    const token = generateToken(payload());
    const req = fakeReq({ headers: { cookie: cookieHeader([AUTH_COOKIE_NAME, token]) }, method: 'POST' });
    const res = fakeRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('authenticate acepta una request POST por cookie cuando el header X-CSRF-Token coincide con la cookie CSRF', async () => {
    const token = generateToken(payload());
    const csrfToken = 'csrf-token-de-prueba';
    const req = fakeReq({
      headers: {
        cookie: cookieHeader([AUTH_COOKIE_NAME, token], [CSRF_COOKIE_NAME, csrfToken]),
        'x-csrf-token': csrfToken,
      },
      method: 'POST',
    });
    const res = fakeRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('authenticate rechaza una request POST por cookie cuando el header CSRF no coincide con la cookie', async () => {
    const token = generateToken(payload());
    const req = fakeReq({
      headers: {
        cookie: cookieHeader([AUTH_COOKIE_NAME, token], [CSRF_COOKIE_NAME, 'token-real']),
        'x-csrf-token': 'token-falsificado',
      },
      method: 'POST',
    });
    const res = fakeRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('handleLogout limpia la cookie de sesión y la cookie CSRF', async () => {
    const req = fakeReq({ method: 'POST' });
    (req as AuthenticatedRequest).user = payload();
    const res = fakeRes();

    await handleLogout(req as AuthenticatedRequest, res);

    expect(res.cleared).toContain(AUTH_COOKIE_NAME);
    expect(res.cleared).toContain(CSRF_COOKIE_NAME);
  });

  it('setAuthCookie/clearAuthCookie y setCsrfCookie/clearCsrfCookie son simétricos en nombre de cookie', () => {
    const res = fakeRes();
    setAuthCookie(res, 'tok');
    setCsrfCookie(res);
    clearAuthCookie(res);
    clearCsrfCookie(res);
    expect(res.cleared).toEqual([AUTH_COOKIE_NAME, CSRF_COOKIE_NAME]);
  });
});
