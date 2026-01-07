import { storage } from "../storage.js";
import { buildUserFeatureVector } from "./features.js";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Materialize feature vectors for a list of users into a CSV file.
 * This is a scaffold for a future training pipeline.
 */
export async function materializeFeatures(users: string[], outPath: string, windowDays = 90) {
  const cols = [
    "userId",
    "windowDays",
    "txCount",
    "debitCount",
    "creditCount",
    "totalDebits",
    "totalCredits",
    "avgAmount",
    "stdAmount",
    "activeDays",
    "debitCreditRatio",
    "incomeRegularity",
    "topCategoryShare",
    // new DTI-related features
    "monthlyIncome",
    "monthlyDebits",
    "dti",
    "dtiCapped",
    "incomeTrend30_90",
    "netCashflowVolatility",
    "recurringExpenseShare",
  ];

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  const header = cols.join(",") + "\n";
  await fs.promises.writeFile(outPath, header, { encoding: "utf-8" });

  for (const userId of users) {
    try {
      // Only include users that exist (in DB or memory)
      const accounts = await storage.getAccounts(userId);
      if (!accounts || accounts.length === 0) {
        continue;
      }
      const fv = await buildUserFeatureVector(userId, windowDays);
      const row = [
        userId,
        fv.windowDays,
        fv.txCount,
        fv.debitCount,
        fv.creditCount,
        fv.totalDebits.toFixed(2),
        fv.totalCredits.toFixed(2),
        fv.avgAmount.toFixed(4),
        fv.stdAmount.toFixed(4),
        fv.activeDays,
        fv.debitCreditRatio.toFixed(6),
        fv.incomeRegularity.toFixed(6),
        fv.topCategoryShare.toFixed(6),
        fv.monthlyIncome.toFixed(2),
        fv.monthlyDebits.toFixed(2),
        fv.dti.toFixed(6),
        fv.dtiCapped.toFixed(6),
        fv.incomeTrend30_90.toFixed(6),
        fv.netCashflowVolatility.toFixed(6),
        fv.recurringExpenseShare.toFixed(6),
      ].join(",") + "\n";
      await fs.promises.appendFile(outPath, row, { encoding: "utf-8" });
    } catch (e) {
      console.error(`Feature materialization failed for ${userId}`, e);
    }
  }
}

// CLI hook: tsx server/ml/materialize.ts demo-user ./ml/out/features.csv
if (import.meta.url === `file://${process.argv[1]}`) {
  const users = process.argv[2] ? process.argv[2].split(",") : ["demo-user"];
  const outPath = process.argv[3] || path.join(process.cwd(), "ml", "out", "features.csv");
  const windowDays = process.argv[4] ? parseInt(process.argv[4], 10) : 90;

  materializeFeatures(users, outPath, windowDays).then(() => {
    console.log(`Features written to ${outPath}`);
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}