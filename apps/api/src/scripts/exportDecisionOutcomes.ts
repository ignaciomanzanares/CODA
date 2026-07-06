/**
 * Exporta los outcomes reales de decisiones (Fase G) a CSV para reentrenar los modelos con data
 * chilena propia. Descifra el snapshot de features y etiqueta con el resultado de la institución.
 *
 * Label = `approved` (originated/approved/accepted → 1, rejected → 0): alimenta el modelo de
 * APROBACIÓN por proveedor ("quién otorga a quién"). La recalibración del PD de default requiere
 * outcomes de REPAGO (préstamos originados que maduran) — pendiente hasta acumular ese historial.
 *
 * Uso:
 *   npm run db:export-decision-outcomes -w @coda/api            # → out/decision_outcomes.csv
 *   npm run db:export-decision-outcomes -w @coda/api -- ruta.csv
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, riskDecisionOutcomes } from '../db/index.js';
import { decryptField, looksEncrypted } from '../services/crypto/fieldEncryption.js';

const APPROVED = new Set(['originated', 'approved', 'accepted']);
// Ruta por defecto relativa al script (no al cwd), para que funcione desde cualquier directorio.
const DEFAULT_OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'ml', 'out', 'decision_outcomes.csv');

async function main() {
  const outPath = process.argv[2] ?? DEFAULT_OUT;
  const rows = (await db.select().from(riskDecisionOutcomes)) as Array<any>;

  const header = ['mora30', 'mora60', 'mora90', 'dti', 'util', 'provider', 'segment', 'approved'];
  const lines = [header.join(',')];
  let labeled = 0;

  for (const r of rows) {
    if (!r.outcome) continue; // solo filas con outcome real
    labeled += 1;
    let cmf: any = null;
    try {
      const raw = r.featuresSnapshot && looksEncrypted(r.featuresSnapshot) ? decryptField(r.featuresSnapshot) : r.featuresSnapshot;
      cmf = raw ? JSON.parse(raw)?.cmf ?? null : null;
    } catch {
      cmf = null;
    }
    const approved = APPROVED.has(r.outcome) ? 1 : 0;
    lines.push([
      cmf?.mora30 ?? '', cmf?.mora60 ?? '', cmf?.mora90 ?? '', cmf?.dtiMensual ?? '', cmf?.utilizacion ?? '',
      JSON.stringify(r.provider ?? ''), r.segment ?? '', approved,
    ].join(','));
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n'));
  console.log(`Exportadas ${labeled} decisiones etiquetadas (de ${rows.length} snapshots) → ${outPath}`);
  if (labeled === 0) {
    console.log('Aún no hay outcomes etiquetados: se acumulan cuando las instituciones responden leads (reportLeadResponse).');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
