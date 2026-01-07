import * as fs from 'node:fs';
import * as path from 'node:path';
import { materializeFeatures } from './materialize.js';

/**
 * Demo helper: materialize features and add a synthetic label column.
 * Label rule: default=1 if debitCreditRatio >= 1.0 OR incomeRegularity < 0.3 OR topCategoryShare >= 0.6
 */
async function main() {
  const users = process.argv[2] ? process.argv[2].split(',') : ['demo-user'];
  const outDir = process.argv[3] || path.join(process.cwd(), 'ml', 'out');
  const windowDays = process.argv[4] ? parseInt(process.argv[4], 10) : 90;
  const tmpCsv = path.join(outDir, 'features.tmp.csv');
  const outCsv = path.join(outDir, 'features_labeled.csv');

  await materializeFeatures(users, tmpCsv, windowDays);

  const lines = fs.readFileSync(tmpCsv, 'utf-8').trim().split(/\r?\n/);
  const header = lines.shift()!;
  const cols = header.split(',');
  const idx = (name: string) => cols.indexOf(name);
  const idxDCR = idx('debitCreditRatio');
  const idxIR = idx('incomeRegularity');
  const idxTop = idx('topCategoryShare');
  const labeled = ['label,' + header];
  for (const ln of lines) {
    const parts = ln.split(',');
    const dcr = parseFloat(parts[idxDCR]);
    const ir = parseFloat(parts[idxIR]);
    const top = parseFloat(parts[idxTop]);
    const label = (dcr >= 1.0 || ir < 0.3 || top >= 0.6) ? 1 : 0;
    labeled.push(`${label},${ln}`);
  }
  await fs.promises.mkdir(outDir, { recursive: true });
  fs.writeFileSync(outCsv, labeled.join('\n'), 'utf-8');
  fs.unlinkSync(tmpCsv);
  console.log(`Labeled features written to ${outCsv}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}