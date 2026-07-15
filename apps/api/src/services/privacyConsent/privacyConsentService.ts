/**
 * Servicio de registro auditable de consentimientos por finalidad (append-only).
 */

import { eq, desc } from "drizzle-orm";
import { db, privacyConsentEvents } from "../../db/index.js";
import {
  PRIVACY_POLICY_VERSION,
  PRIVACY_PURPOSE_KEYS,
  type PrivacyPurposeKey,
  type PrivacyConsentAction,
  type PrivacyConsentEventMeta,
  type PrivacyPurposeState,
  type PrivacyAuditEventRow,
} from "./privacyConsentTypes.js";

const MAX_UA_LEN = 500;

function truncateUa(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return ua.length > MAX_UA_LEN ? ua.slice(0, MAX_UA_LEN) : ua;
}

function isPurpose(k: string): k is PrivacyPurposeKey {
  return (PRIVACY_PURPOSE_KEYS as readonly string[]).includes(k);
}

export async function recordPrivacyEvent(
  userId: string,
  purpose: PrivacyPurposeKey,
  policyVersion: string,
  action: PrivacyConsentAction,
  meta: PrivacyConsentEventMeta = {},
): Promise<void> {
  await db.insert(privacyConsentEvents).values({
    userId,
    purpose,
    policyVersion,
    action,
    channel: meta.channel ?? "web",
    ipAddress: meta.ipAddress ?? null,
    userAgent: truncateUa(meta.userAgent ?? undefined),
  });
}

/** Registro masivo tras alta o flujos de onboarding (mismos metadatos). */
export async function recordBatchAccept(
  userId: string,
  purposeVersions: { purpose: PrivacyPurposeKey; policyVersion: string }[],
  meta: PrivacyConsentEventMeta,
): Promise<void> {
  if (purposeVersions.length === 0) return;
  await db.insert(privacyConsentEvents).values(
    purposeVersions.map((p) => ({
      userId,
      purpose: p.purpose,
      policyVersion: p.policyVersion,
      action: "accepted" as const,
      channel: meta.channel ?? "web",
      ipAddress: meta.ipAddress ?? null,
      userAgent: truncateUa(meta.userAgent ?? undefined),
    })),
  );
}

export async function getPurposeStates(userId: string): Promise<PrivacyPurposeState[]> {
  const rows = await db
    .select()
    .from(privacyConsentEvents)
    .where(eq(privacyConsentEvents.userId, userId))
    .orderBy(desc(privacyConsentEvents.createdAt));

  const latestByPurpose = new Map<
    PrivacyPurposeKey,
    { action: PrivacyConsentAction; policyVersion: string; createdAt: string }
  >();
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const p = r.purpose as string;
    if (!isPurpose(p)) continue;
    if (latestByPurpose.has(p)) continue;
    latestByPurpose.set(p, {
      action: r.action as PrivacyConsentAction,
      policyVersion: (r.policyVersion as string) ?? PRIVACY_POLICY_VERSION,
      createdAt: (r.createdAt as string) ?? "",
    });
  }

  return PRIVACY_PURPOSE_KEYS.map((purpose) => {
    const last = latestByPurpose.get(purpose);
    if (!last) {
      return {
        purpose,
        accepted: false,
        policyVersion: null,
        lastAction: null,
        updatedAt: null,
      };
    }
    return {
      purpose,
      accepted: last.action === "accepted",
      policyVersion: last.policyVersion,
      lastAction: last.action,
      updatedAt: last.createdAt,
    };
  });
}

export async function listAuditTrail(userId: string, limit = 100): Promise<PrivacyAuditEventRow[]> {
  const rows = await db
    .select()
    .from(privacyConsentEvents)
    .where(eq(privacyConsentEvents.userId, userId))
    .orderBy(desc(privacyConsentEvents.createdAt))
    .limit(Math.min(limit, 500));

  return rows.map((row: Record<string, unknown>) => {
    const r = row;
    const purpose = r.purpose as string;
    return {
      id: r.id as number,
      purpose: isPurpose(purpose) ? purpose : "data_processing",
      policyVersion: (r.policyVersion as string) ?? PRIVACY_POLICY_VERSION,
      action: r.action as PrivacyConsentAction,
      channel: (r.channel as string) ?? "web",
      ipAddress: (r.ipAddress as string) ?? null,
      userAgent: (r.userAgent as string) ?? null,
      createdAt: (r.createdAt as string) ?? "",
    };
  });
}

export async function revokePurpose(
  userId: string,
  purpose: PrivacyPurposeKey,
  policyVersion: string,
  meta: PrivacyConsentEventMeta,
): Promise<void> {
  await recordPrivacyEvent(userId, purpose, policyVersion, "revoked", meta);
}

export async function acceptPurpose(
  userId: string,
  purpose: PrivacyPurposeKey,
  policyVersion: string,
  meta: PrivacyConsentEventMeta,
): Promise<void> {
  await recordPrivacyEvent(userId, purpose, policyVersion, "accepted", meta);
}
