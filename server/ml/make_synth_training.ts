import * as fs from "node:fs";
import * as path from "node:path";
// Note: we will dynamically import modules that touch storage AFTER setting USE_MEM_STORAGE
// so that we run entirely in memory and don't require a DB during synthetic generation.
import type { FeatureVector } from "./features";

/**
 * Generate a synthetic training CSV by:
 *  - Creating N synthetic users with mock Open Banking data
 *  - Computing the feature vector for each user
 *  - Generating a synthetic label by sampling y ~ Bernoulli(pd_baseline)
 *  - Writing rows: [features..., label]
 *
 * Usage:
 *   tsx server/ml/make_synth_training.ts [outPath] [nUsers] [windowDays]
 *
 * Defaults:
 *   outPath    = server/ml/out/synth_features.csv
 *   nUsers     = 200
 *   windowDays = 90
 */
async function main() {
  const outPath = process.argv[2] || path.join(process.cwd(), "server", "ml", "out", "synth_features.csv");
  const nUsers = process.argv[3] ? parseInt(process.argv[3], 10) : 200;
  const windowDays = process.argv[4] ? parseInt(process.argv[4], 10) : 90;

  // Force memory storage for this script
  if (!process.env.USE_MEM_STORAGE) process.env.USE_MEM_STORAGE = '1';

  // Dynamic imports after setting env
  const { ingestOpenBankingForUser } = await import("../jobs/ingest");
  const { buildUserFeatureVector } = await import("./features");
  const { scorePD } = await import("../services/pdScoring");

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  // Define feature columns explicitly to ensure stable order
  const cols: Array<keyof FeatureVector> = [
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
    // new DTI & volatility features
    "monthlyIncome",
    "monthlyDebits",
    "dti",
    "dtiCapped",
    "incomeTrend30_90",
    "netCashflowVolatility",
    "recurringExpenseShare",
  ];

  const header = cols.join(",") + ",label\n";
  await fs.promises.writeFile(outPath, header, { encoding: "utf-8" });

  for (let i = 1; i <= nUsers; i++) {
    const userId = `synth-${i}`;
    try {
      // Populate synthetic OB data for this user
      await ingestOpenBankingForUser(userId);

      // Compute features
      const fv = await buildUserFeatureVector(userId, windowDays);

      // Baseline PD
      const { pd } = scorePD(fv);

      // Synthetic label: Bernoulli(pd)
      const label = Math.random() < pd ? 1 : 0;

      const row = cols.map((c) => (fv[c] as number)).join(",") + "," + label + "\n";
      await fs.promises.appendFile(outPath, row, { encoding: "utf-8" });

      if (i % 25 === 0) {
        // eslint-disable-next-line no-console
        console.log(`Generated ${i}/${nUsers} synthetic users...`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed for user ${userId}`, e);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Synthetic training data written to ${outPath}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});