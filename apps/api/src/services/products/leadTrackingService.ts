/**
 * Lead Tracking Service
 * 
 * Records all user interactions with financial products:
 * - VIEW: User sees the product in the list
 * - CLICK: User clicks for details
 * - APPLICATION: User submits application
 * - APPROVAL: Institution approves the application
 * - REJECTION: Institution rejects the application
 * 
 * Used for:
 * 1. Funnel analytics (conversion rates)
 * 2. Revenue tracking (lead fees + success fees)
 * 3. Algorithm optimization (which recommendations convert best)
 */

import { db, leadTracking, productApplications, eq, and, desc, sql } from '../../db/index.js';
import { logger } from '../../logger.js';
import type { ProductCatalogItem } from './productCatalog.js';
import { calculateProductRevenue } from './productCatalog.js';

export type LeadEventType = 'view' | 'click' | 'application' | 'approval' | 'rejection';

/**
 * Máquina de estados de un lead (productApplications.status):
 *   pending   → el usuario aplicó (lead creado).
 *   delivered → la institución obtuvo el lead vía la API de instituciones.
 *   accepted  → la institución lo aceptó (aprobado, sin desembolso aún; sin success fee).
 *   approved  → originado/desembolsado (genera success fee). "originated" en la API externa.
 *   rejected  → la institución lo rechazó.
 *   expired / withdrawn → ciclo cerrado sin originación.
 */
export type ApplicationStatus =
  | 'pending'
  | 'delivered'
  | 'accepted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export interface TrackLeadEventParams {
  userId: string;
  productId: number;
  eventType: LeadEventType;
  matchScore?: number;
  userCreditScore?: number;
  userTransactionalScore?: number;
  metadata?: Record<string, unknown>;
}

export interface ApplicationData {
  requestedAmount?: number;
  term?: number;
  purpose?: string;
  additionalInfo?: Record<string, unknown>;
}

/**
 * Track a lead event (view, click, application, etc.)
 */
export async function trackLeadEvent(params: TrackLeadEventParams): Promise<void> {
  try {
    await db.insert(leadTracking).values({
      userId: params.userId,
      productId: params.productId,
      eventType: params.eventType,
      matchScore: params.matchScore ?? null,
      userCreditScore: params.userCreditScore ?? null,
      userTransactionalScore: params.userTransactionalScore ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      timestamp: new Date().toISOString()
    });

    logger.info({
      userId: params.userId,
      productId: params.productId,
      eventType: params.eventType,
      matchScore: params.matchScore
    }, 'Lead event tracked');
  } catch (error) {
    logger.error({ error, params }, 'Failed to track lead event');
    // Don't throw - tracking failures shouldn't break user flow
  }
}

/**
 * Track product view (bulk)
 * Called when user loads product page and sees multiple products
 */
export async function trackProductViews(
  userId: string,
  productIds: number[],
  matchScores: Map<number, number>,
  userCreditScore?: number,
  userTransactionalScore?: number
): Promise<void> {
  try {
    const events = productIds.map(productId => ({
      userId,
      productId,
      eventType: 'view' as const,
      matchScore: matchScores.get(productId) ?? null,
      userCreditScore: userCreditScore ?? null,
      userTransactionalScore: userTransactionalScore ?? null,
      metadata: JSON.stringify({ source: 'product_page' }),
      timestamp: new Date().toISOString()
    }));

    if (events.length > 0) {
      await db.insert(leadTracking).values(events);
      logger.info({ userId, productCount: events.length }, 'Bulk product views tracked');
    }
  } catch (error) {
    logger.error({ error, userId }, 'Failed to track product views');
  }
}

/**
 * Create a formal product application
 */
export async function createProductApplication(
  userId: string,
  productId: number,
  applicationData: ApplicationData,
  product: ProductCatalogItem
): Promise<number> {
  try {
    // Calculate lead fee revenue
    const leadFeeRevenue = product.leadFee ?? 0;

    const [result] = await db.insert(productApplications).values({
      userId,
      productId,
      status: 'pending',
      applicationData: JSON.stringify(applicationData),
      appliedAt: new Date().toISOString(),
      revenueEarned: leadFeeRevenue > 0 ? leadFeeRevenue : null,
      revenueType: leadFeeRevenue > 0 ? 'lead_fee' : null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).returning({ id: productApplications.id });

    // Also track as lead event
    await trackLeadEvent({
      userId,
      productId,
      eventType: 'application',
      metadata: { applicationId: result.id, requestedAmount: applicationData.requestedAmount }
    });

    logger.info({
      userId,
      productId,
      applicationId: result.id,
      leadFeeRevenue
    }, 'Product application created');

    // Fase G: congela el snapshot de riesgo al aplicar (anti-leakage), fire-and-forget.
    import('../risk/decisionOutcomes.js')
      .then(({ captureDecisionSnapshot }) =>
        captureDecisionSnapshot({ userId, applicationId: result.id, provider: (product as any).provider ?? null, productId }),
      )
      .catch(() => {});

    return result.id;
  } catch (error) {
    logger.error({ error, userId, productId }, 'Failed to create product application');
    throw new Error('Failed to create product application');
  }
}

/**
 * Update application status (approval/rejection)
 * Called when institution responds
 */
export async function updateApplicationStatus(
  applicationId: number,
  status: ApplicationStatus,
  product: ProductCatalogItem,
  loanAmount?: number,
  externalApplicationId?: string
): Promise<void> {
  try {
    // Get existing application
    const [application] = await db
      .select()
      .from(productApplications)
      .where(eq(productApplications.id, applicationId))
      .limit(1);

    if (!application) {
      throw new Error('Application not found');
    }

    // Calculate additional revenue for approvals
    let additionalRevenue = 0;
    let revenueType = application.revenueType;

    if (status === 'approved') {
      const successFee = calculateProductRevenue(product, loanAmount, 'approval');
      additionalRevenue = successFee;
      revenueType = 'success_fee';
    }

    const totalRevenue = (application.revenueEarned ?? 0) + additionalRevenue;

    // Update application
    await db
      .update(productApplications)
      .set({
        status,
        respondedAt: new Date().toISOString(),
        externalApplicationId: externalApplicationId ?? null,
        revenueEarned: totalRevenue > 0 ? totalRevenue : null,
        revenueType,
        updatedAt: new Date().toISOString()
      })
      .where(eq(productApplications.id, applicationId));

    // Track event solo en los estados terminales que alimentan el funnel (aprobación/rechazo).
    // 'delivered'/'accepted' son intermedios y no deben contarse como conversión ni pérdida.
    if (status === 'approved' || status === 'rejected') {
      await trackLeadEvent({
        userId: application.userId,
        productId: application.productId,
        eventType: status === 'approved' ? 'approval' : 'rejection',
        metadata: { applicationId, externalApplicationId, loanAmount, revenue: totalRevenue }
      });
    }

    // Fase G: registra el outcome real de la institución (label para reentrenar), fire-and-forget.
    if (status === 'approved' || status === 'rejected' || status === 'accepted') {
      import('../risk/decisionOutcomes.js')
        .then(({ recordDecisionOutcome }) =>
          recordDecisionOutcome({ applicationId, outcome: status, originatedAmountClp: loanAmount ?? null }),
        )
        .catch(() => {});
    }

    logger.info({
      applicationId,
      status,
      totalRevenue,
      externalApplicationId
    }, 'Application status updated');
  } catch (error) {
    logger.error({ error, applicationId, status }, 'Failed to update application status');
    throw error;
  }
}

/**
 * Record activation bonus (e.g., for credit cards when user makes first purchase)
 */
export async function recordActivationBonus(
  applicationId: number,
  product: ProductCatalogItem
): Promise<void> {
  try {
    const bonus = product.activationBonus ?? 0;
    if (bonus === 0) return;

    const [application] = await db
      .select()
      .from(productApplications)
      .where(eq(productApplications.id, applicationId))
      .limit(1);

    if (!application) return;

    const newRevenue = (application.revenueEarned ?? 0) + bonus;

    await db
      .update(productApplications)
      .set({
        revenueEarned: newRevenue,
        revenueType: 'activation_bonus',
        notes: `Bonus de activación aplicado: CLP ${bonus.toLocaleString('es-CL')}`,
        updatedAt: new Date().toISOString()
      })
      .where(eq(productApplications.id, applicationId));

    logger.info({ applicationId, bonus, newRevenue }, 'Activation bonus recorded');
  } catch (error) {
    logger.error({ error, applicationId }, 'Failed to record activation bonus');
  }
}

/**
 * Get conversion funnel metrics for a product
 */
export async function getProductFunnelMetrics(productId: number): Promise<{
  views: number;
  clicks: number;
  applications: number;
  approvals: number;
  rejections: number;
  viewToClickRate: number;
  clickToApplicationRate: number;
  applicationToApprovalRate: number;
  overallConversionRate: number;
  totalRevenue: number;
}> {
  try {
    // Count events by type
    const eventCounts = await db
      .select({
        eventType: leadTracking.eventType,
        count: sql<number>`CAST(count(*) AS INTEGER)`
      })
      .from(leadTracking)
      .where(eq(leadTracking.productId, productId))
      .groupBy(leadTracking.eventType);

    const counts: Record<string, number> = {
      view: 0,
      click: 0,
      application: 0,
      approval: 0,
      rejection: 0
    };

    eventCounts.forEach((row: { eventType: string; count: number }) => {
      counts[row.eventType] = row.count;
    });

    // Calculate conversion rates
    const viewToClickRate = counts.view > 0 ? (counts.click / counts.view) * 100 : 0;
    const clickToApplicationRate = counts.click > 0 ? (counts.application / counts.click) * 100 : 0;
    const applicationToApprovalRate = counts.application > 0 ? (counts.approval / counts.application) * 100 : 0;
    const overallConversionRate = counts.view > 0 ? (counts.approval / counts.view) * 100 : 0;

    // Calculate total revenue from applications
    const revenueResult = await db
      .select({
        total: sql<number>`CAST(COALESCE(SUM(${productApplications.revenueEarned}), 0) AS INTEGER)`
      })
      .from(productApplications)
      .where(eq(productApplications.productId, productId));

    const totalRevenue = revenueResult[0]?.total ?? 0;

    return {
      views: counts.view,
      clicks: counts.click,
      applications: counts.application,
      approvals: counts.approval,
      rejections: counts.rejection,
      viewToClickRate,
      clickToApplicationRate,
      applicationToApprovalRate,
      overallConversionRate,
      totalRevenue
    };
  } catch (error) {
    logger.error({ error, productId }, 'Failed to get product funnel metrics');
    return {
      views: 0,
      clicks: 0,
      applications: 0,
      approvals: 0,
      rejections: 0,
      viewToClickRate: 0,
      clickToApplicationRate: 0,
      applicationToApprovalRate: 0,
      overallConversionRate: 0,
      totalRevenue: 0
    };
  }
}

/**
 * Get user's application history
 */
export async function getUserApplications(userId: string): Promise<any[]> {
  try {
    const applications = await db
      .select()
      .from(productApplications)
      .where(eq(productApplications.userId, userId))
      .orderBy(desc(productApplications.appliedAt));

    return applications;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user applications');
    return [];
  }
}

/**
 * Get total revenue metrics (for dashboard)
 */
export async function getTotalRevenueMetrics(): Promise<{
  totalRevenue: number;
  revenueByType: Record<string, number>;
  revenueByProduct: Record<number, number>;
  applicationsCount: number;
  approvalsCount: number;
  avgRevenuePerApproval: number;
}> {
  try {
    // Total revenue
    const totalResult = await db
      .select({
        total: sql<number>`CAST(COALESCE(SUM(${productApplications.revenueEarned}), 0) AS INTEGER)`
      })
      .from(productApplications);

    const totalRevenue = totalResult[0]?.total ?? 0;

    // Revenue by type
    const revenueByTypeResult = await db
      .select({
        revenueType: productApplications.revenueType,
        total: sql<number>`CAST(COALESCE(SUM(${productApplications.revenueEarned}), 0) AS INTEGER)`
      })
      .from(productApplications)
      .where(sql`${productApplications.revenueType} IS NOT NULL`)
      .groupBy(productApplications.revenueType);

    const revenueByType: Record<string, number> = {};
    revenueByTypeResult.forEach((row: { revenueType: string | null; total: number }) => {
      if (row.revenueType) {
        revenueByType[row.revenueType] = row.total;
      }
    });

    // Revenue by product
    const revenueByProductResult = await db
      .select({
        productId: productApplications.productId,
        total: sql<number>`CAST(COALESCE(SUM(${productApplications.revenueEarned}), 0) AS INTEGER)`
      })
      .from(productApplications)
      .groupBy(productApplications.productId);

    const revenueByProduct: Record<number, number> = {};
    revenueByProductResult.forEach((row: { productId: number; total: number }) => {
      revenueByProduct[row.productId] = row.total;
    });

    // Counts
    const countsResult = await db
      .select({
        total: sql<number>`CAST(count(*) AS INTEGER)`,
        approved: sql<number>`CAST(count(*) FILTER (WHERE ${productApplications.status} = 'approved') AS INTEGER)`
      })
      .from(productApplications);

    const applicationsCount = countsResult[0]?.total ?? 0;
    const approvalsCount = countsResult[0]?.approved ?? 0;
    const avgRevenuePerApproval = approvalsCount > 0 ? totalRevenue / approvalsCount : 0;

    return {
      totalRevenue,
      revenueByType,
      revenueByProduct,
      applicationsCount,
      approvalsCount,
      avgRevenuePerApproval
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get total revenue metrics');
    return {
      totalRevenue: 0,
      revenueByType: {},
      revenueByProduct: {},
      applicationsCount: 0,
      approvalsCount: 0,
      avgRevenuePerApproval: 0
    };
  }
}

/**
 * Get funnel metrics across all products (for admin dashboard)
 */
export async function getOverallFunnelMetrics(): Promise<{
  totalViews: number;
  totalClicks: number;
  totalApplications: number;
  totalApprovals: number;
  totalRejections: number;
  overallConversionRate: number;
  avgMatchScore: number;
  topPerformingProducts: Array<{ productId: number; conversionRate: number; revenue: number }>;
}> {
  try {
    // Count all events
    const eventCounts = await db
      .select({
        eventType: leadTracking.eventType,
        count: sql<number>`CAST(count(*) AS INTEGER)`,
        avgMatchScore: sql<number>`AVG(${leadTracking.matchScore})`
      })
      .from(leadTracking)
      .groupBy(leadTracking.eventType);

    const counts: Record<string, number> = {
      view: 0,
      click: 0,
      application: 0,
      approval: 0,
      rejection: 0
    };
    let totalMatchScoreSum = 0;
    let matchScoreCount = 0;

    eventCounts.forEach((row: { eventType: string; count: number; avgMatchScore: number | null }) => {
      counts[row.eventType] = row.count;
      if (row.avgMatchScore) {
        totalMatchScoreSum += row.avgMatchScore * row.count;
        matchScoreCount += row.count;
      }
    });

    const overallConversionRate = counts.view > 0 ? (counts.approval / counts.view) * 100 : 0;
    const avgMatchScore = matchScoreCount > 0 ? totalMatchScoreSum / matchScoreCount : 0;

    // Top performing products (by conversion rate)
    const topProducts = await db
      .select({
        productId: leadTracking.productId,
        views: sql<number>`CAST(count(*) FILTER (WHERE ${leadTracking.eventType} = 'view') AS INTEGER)`,
        approvals: sql<number>`CAST(count(*) FILTER (WHERE ${leadTracking.eventType} = 'approval') AS INTEGER)`
      })
      .from(leadTracking)
      .groupBy(leadTracking.productId)
      .orderBy(desc(sql`count(*) FILTER (WHERE ${leadTracking.eventType} = 'approval')`))
      .limit(10);

    const topPerformingProducts = await Promise.all(
      topProducts.map(async (p: { productId: number; views: number; approvals: number }) => {
        const conversionRate = p.views > 0 ? (p.approvals / p.views) * 100 : 0;
        
        // Get revenue for this product
        const revenueResult = await db
          .select({
            total: sql<number>`CAST(COALESCE(SUM(${productApplications.revenueEarned}), 0) AS INTEGER)`
          })
          .from(productApplications)
          .where(eq(productApplications.productId, p.productId));
        
        const revenue = revenueResult[0]?.total ?? 0;

        return {
          productId: p.productId,
          conversionRate,
          revenue
        };
      })
    );

    return {
      totalViews: counts.view,
      totalClicks: counts.click,
      totalApplications: counts.application,
      totalApprovals: counts.approval,
      totalRejections: counts.rejection,
      overallConversionRate,
      avgMatchScore,
      topPerformingProducts
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get overall funnel metrics');
    return {
      totalViews: 0,
      totalClicks: 0,
      totalApplications: 0,
      totalApprovals: 0,
      totalRejections: 0,
      overallConversionRate: 0,
      avgMatchScore: 0,
      topPerformingProducts: []
    };
  }
}

/**
 * Get user's recent product interactions (for personalization)
 */
export async function getUserRecentInteractions(
  userId: string,
  limit: number = 20
): Promise<Array<{ productId: number; eventType: string; timestamp: string }>> {
  try {
    const interactions = await db
      .select({
        productId: leadTracking.productId,
        eventType: leadTracking.eventType,
        timestamp: leadTracking.timestamp
      })
      .from(leadTracking)
      .where(eq(leadTracking.userId, userId))
      .orderBy(desc(leadTracking.timestamp))
      .limit(limit);

    return interactions;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user interactions');
    return [];
  }
}
