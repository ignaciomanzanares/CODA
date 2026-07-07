import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql, empresasCompanies } from '../../db/index.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import type { Response } from 'express';
import {
  resolveEmpresasUserId,
  isMember,
  listMemberCompanyIds,
  grantMembership,
  requireMembership,
} from '../membership.js';

/**
 * #G: aislamiento multi-tenancy. El usuario A no puede acceder a la empresa del usuario B.
 */
beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS empresas_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, password_hash TEXT NOT NULL,
      name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  db.run(
    sql`CREATE TABLE IF NOT EXISTS empresas_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, rut TEXT NOT NULL, industry TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  db.run(
    sql`CREATE TABLE IF NOT EXISTS empresas_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, company_id INTEGER NOT NULL,
      role TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
});

function fakeReq(email: string): AuthenticatedRequest {
  return { user: { userId: email, email } } as unknown as AuthenticatedRequest;
}

function fakeRes() {
  const r: any = { statusCode: 0, body: null };
  r.status = (c: number) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b: unknown) => {
    r.body = b;
    return r;
  };
  return r as Response & { statusCode: number; body: any };
}

describe('Empresas multi-tenancy (#G)', () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const emailA = `owner-a-${unique}@example.com`;
  const emailB = `intruder-b-${unique}@example.com`;
  let companyId = 0;

  beforeAll(async () => {
    const [c] = await db
      .insert(empresasCompanies)
      .values({ name: `ACME ${unique}`, rut: '76.000.000-0' })
      .returning({ id: empresasCompanies.id });
    companyId = c.id;
    // A es dueño; B no tiene membresía.
    await grantMembership(fakeReq(emailA), companyId, 'owner');
  });

  afterAll(async () => {
    await db.run(sql`DELETE FROM empresas_memberships WHERE company_id = ${companyId}`);
    await db.run(sql`DELETE FROM empresas_companies WHERE id = ${companyId}`);
    await db.run(sql`DELETE FROM empresas_users WHERE email IN (${emailA}, ${emailB})`);
  });

  it('crea/resuelve empresas_user por email (puente SSO)', async () => {
    const idA = await resolveEmpresasUserId(fakeReq(emailA));
    expect(idA).toBeTruthy();
    // Idempotente: segunda resolución devuelve el mismo id.
    expect(await resolveEmpresasUserId(fakeReq(emailA))).toBe(idA);
  });

  it('el dueño A es miembro; el intruso B NO', async () => {
    expect(await isMember(fakeReq(emailA), companyId)).toBe(true);
    expect(await isMember(fakeReq(emailB), companyId)).toBe(false);
  });

  it('requireMembership responde 403 al intruso y deja pasar al dueño', async () => {
    const resB = fakeRes();
    const okB = await requireMembership(fakeReq(emailB), resB, companyId);
    expect(okB).toBe(false);
    expect(resB.statusCode).toBe(403);

    const resA = fakeRes();
    const okA = await requireMembership(fakeReq(emailA), resA, companyId);
    expect(okA).toBe(true);
    expect(resA.statusCode).toBe(0); // no escribió error
  });

  it('listMemberCompanyIds solo devuelve las empresas del usuario', async () => {
    expect(await listMemberCompanyIds(fakeReq(emailA))).toContain(companyId);
    expect(await listMemberCompanyIds(fakeReq(emailB))).not.toContain(companyId);
  });
});
