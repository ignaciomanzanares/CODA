import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, users, consentGrants, privacyConsentEvents, algorithmPredictionLogs, documentUploads } from '../../../db/index';
import { logCreditScorePrediction } from '../../audit/algorithmicTraceability';
import { anonymizeUser } from '../accountAnonymization';

// Identificadores únicos por corrida: la SQLite local es un archivo persistente entre test runs.
const USER_ID = `user-anon-test-${randomUUID()}`;
const REQUEST_ID = `req-anon-test-${randomUUID()}`;

describe('anonymizeUser', () => {
  beforeAll(async () => {
    await db
      .insert(users)
      .values({
        id: USER_ID,
        username: USER_ID,
        email: `${USER_ID}@test.local`,
        passwordHash: 'test-hash',
        firstName: 'Juan',
        lastName: 'Perez',
        totpSecret: 'totp-secret',
        backupCodes: 'codes',
      })
      .onConflictDoNothing();

    await db.insert(documentUploads).values({
      id: `doc-anon-test-${randomUUID()}`,
      userId: USER_ID,
      tipo: 'cmf_informe',
      parsedData: JSON.stringify({ rut: '12.345.678-9' }),
    });

    await db.insert(consentGrants).values({
      userId: USER_ID,
      status: 'granted',
      authorizationDetails: 'detalle-real-de-autorizacion',
      purpose: 'credit_scoring',
      policyVersion: 'v1',
    });

    await db.insert(privacyConsentEvents).values({
      userId: USER_ID,
      purpose: 'credit_scoring',
      policyVersion: 'v1',
      action: 'granted',
      ipAddress: '1.2.3.4',
      userAgent: 'test-agent',
    });

    await logCreditScorePrediction(
      USER_ID,
      REQUEST_ID,
      { creditScore: 700, probabilityDefault: 0.1, riskCategory: 'GOOD', confidence: 0.8 },
      { cmfData: { rut: '12.345.678-9' }, features: { ingreso: 1000000 } },
    );
  });

  it('scrubs PII from the users row but keeps it satisfying FKs', async () => {
    await anonymizeUser(USER_ID);

    const [user] = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(user).toBeDefined();
    expect(user.email).not.toContain('test.local');
    expect(user.username).not.toBe(USER_ID);
    expect(user.firstName).toBeNull();
    expect(user.lastName).toBeNull();
    expect(user.totpSecret).toBeNull();
    expect(user.backupCodes).toBeNull();
  });

  it('deletes the document uploads', async () => {
    const docs = await db.select().from(documentUploads).where(eq(documentUploads.userId, USER_ID));
    expect(docs).toHaveLength(0);
  });

  it('keeps the algorithm_prediction_logs row but de-links userId and strips input PII', async () => {
    const logs = await db.select().from(algorithmPredictionLogs).where(eq(algorithmPredictionLogs.requestId, REQUEST_ID));
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.userId).not.toBe(USER_ID);
    expect(log.cmfData).toBeNull();
    expect(log.sfaData).toBeNull();
    expect(log.topFactors).toBeNull();
    expect(log.outputSnapshot).toBeTruthy();

    const [placeholderUser] = await db.select().from(users).where(eq(users.id, log.userId));
    expect(placeholderUser).toBeDefined();
  });

  it('keeps the consent grant/event rows but anonymizes IP/user-agent', async () => {
    const [grant] = await db.select().from(consentGrants).where(eq(consentGrants.userId, USER_ID));
    expect(grant).toBeDefined();
    expect(grant.authorizationDetails).not.toBe('detalle-real-de-autorizacion');

    const [event] = await db.select().from(privacyConsentEvents).where(eq(privacyConsentEvents.userId, USER_ID));
    expect(event).toBeDefined();
    expect(event.ipAddress).toBeNull();
    expect(event.userAgent).toBeNull();
  });
});
