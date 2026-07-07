import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { db, users, financialProducts, productApplications, eq } from '../../../db/index';
import { createProductApplication } from '../../products/leadTrackingService';
import { getLeadsForInstitution, respondToLead } from '../institutionLeads';
import { hashApiKey, generateApiKey } from '../institutionAuth';

const PROVIDER = `TestBank-${randomUUID().slice(0, 8)}`;
const OTHER_PROVIDER = `OtherBank-${randomUUID().slice(0, 8)}`;
const USER_ID = `user-inst-test-${randomUUID()}`;

let productId: number;
let leadId: number;

describe('flujo de leads de institución (end-to-end)', () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: USER_ID,
      username: USER_ID,
      email: `${USER_ID}@test.local`,
      passwordHash: 'x',
    }).onConflictDoNothing();

    const [prod] = await db.insert(financialProducts).values({
      slug: `test-consumo-${randomUUID().slice(0, 8)}`,
      provider: PROVIDER,
      productName: 'Crédito Test',
      category: 'creditos_consumo',
      productType: 'loan',
      description: 'producto de prueba',
      leadFee: 10000,
      successFeeBps: 60,
      isActive: 1,
      priority: 50,
    }).returning({ id: financialProducts.id });
    productId = prod.id;
  });

  it('el usuario aplica → se crea un lead pending con lead fee', async () => {
    leadId = await createProductApplication(
      USER_ID,
      productId,
      { requestedAmount: 1_000_000, term: 24, purpose: 'consolidar' },
      { leadFee: 10000, successFeeBps: 60 } as any,
    );
    const [app] = await db.select().from(productApplications).where(eq(productApplications.id, leadId));
    expect(app.status).toBe('pending');
    expect(app.revenueEarned).toBe(10000); // lead fee
  });

  it('la institución ve su lead (seudonimizado, sin PII) y lo marca delivered', async () => {
    const leads = await getLeadsForInstitution(PROVIDER);
    const lead = leads.find((l) => l.leadId === leadId);
    expect(lead).toBeDefined();
    expect(lead!.status).toBe('delivered');
    expect(lead!.product.id).toBe(productId);
    expect(lead!.requestedAmount).toBe(1_000_000);
    // Sin PII: el payload no expone userId/email.
    expect(JSON.stringify(lead)).not.toContain(USER_ID);
    // En DB el estado quedó delivered.
    const [app] = await db.select().from(productApplications).where(eq(productApplications.id, leadId));
    expect(app.status).toBe('delivered');
  });

  it('otra institución NO ve el lead', async () => {
    const leads = await getLeadsForInstitution(OTHER_PROVIDER);
    expect(leads.find((l) => l.leadId === leadId)).toBeUndefined();
  });

  it('otra institución NO puede responder el lead (autorización por provider)', async () => {
    const ok = await respondToLead(OTHER_PROVIDER, leadId, 'originated', 1_000_000);
    expect(ok).toBe(false);
    const [app] = await db.select().from(productApplications).where(eq(productApplications.id, leadId));
    expect(app.status).toBe('delivered'); // sin cambios
  });

  it('la institución dueña origina el lead → success fee registrado', async () => {
    const ok = await respondToLead(PROVIDER, leadId, 'originated', 1_000_000, 'EXT-123');
    expect(ok).toBe(true);
    const [app] = await db.select().from(productApplications).where(eq(productApplications.id, leadId));
    expect(app.status).toBe('approved'); // originated → approved interno
    // lead fee (10.000) + success fee (1.000.000 * 60bps / 10.000 = 6.000) = 16.000
    expect(app.revenueEarned).toBe(16000);
    expect(app.revenueType).toBe('success_fee');
    expect(app.externalApplicationId).toBe('EXT-123');
  });

  it('hashApiKey es determinístico y generateApiKey produce keys con prefijo', () => {
    const key = generateApiKey();
    expect(key.startsWith('coda_')).toBe(true);
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(key);
  });
});
