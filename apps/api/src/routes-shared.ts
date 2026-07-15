import type { Request } from "express";

import { z } from "zod";
import { type AuthenticatedRequest } from "./middleware/auth.js";

import { createFinancialGoalSchema } from "./middleware/validation.js";

// Helper to get user ID from JWT
export function getUserIdFromAuth(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  return authReq.user?.userId || "";
}

/** Fila lista para `storage.createFinancialGoal` (sin depender de insertFinancialGoalSchema del paquete). */
export function rowFromCreateGoalBody(
  userId: string,
  body: z.infer<typeof createFinancialGoalSchema>,
): {
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
} {
  const targetAmount = Math.round(Number(body.targetAmount));
  const currentAmount = Math.round(Number(body.currentAmount ?? 0));
  const td = body.targetDate;
  let targetDateStr: string;
  if (typeof td === "string") {
    targetDateStr = td.includes("T") ? td.split("T")[0]! : td;
  } else if (td instanceof Date) {
    targetDateStr = td.toISOString().split("T")[0]!;
  } else {
    targetDateStr = new Date(td as unknown as string).toISOString().split("T")[0]!;
  }
  return {
    userId,
    name: body.name.trim(),
    targetAmount,
    currentAmount,
    targetDate: targetDateStr,
    category: body.category || "other",
  };
}

// Helper to resolve ML artifacts directory
// Supports running from repo root, apps/api, or compiled output
export async function getMLArtifactsDir(): Promise<string> {
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");

  const possiblePaths = [
    pathMod.join(process.cwd(), "apps", "api", "src", "ml", "artifacts", "current"),
    pathMod.join(process.cwd(), "src", "ml", "artifacts", "current"),
  ];

  for (const p of possiblePaths) {
    if (fsMod.existsSync(p)) return p;
  }

  // Default fallback
  return possiblePaths[0];
}
