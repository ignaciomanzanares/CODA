/**
 * Promueve un artefacto de modelo entrenado a 'production' SIN redeploy (#5).
 *
 * Sube `xgb.json`/`feature_meta.json`/`manifest.json` del dir indicado al blob store
 * (S3/R2 si está configurado, si no Postgres) bajo un prefijo versionado, y registra/actualiza
 * la fila en `algorithm_model_versions`: marca la anterior 'production' como 'archived' e
 * inserta la nueva como 'production' con `artifactUri`, `auc` y `dataset_hash` del manifest.
 *
 * `modelRegistry.loadProductionFromRegistry()` (al boot, o vía endpoint de reload) descarga esa
 * fila y empieza a servir el modelo nuevo — sin volver a desplegar.
 *
 * Uso:
 *   npx tsx apps/api/scripts/promote-model.ts <artifactDir>            # dry-run
 *   npx tsx apps/api/scripts/promote-model.ts <artifactDir> --apply   # promueve
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, algorithmModelVersions, eq, and } from '../src/db/index.js';
import { getBlobStore } from '../src/services/storage/blobStore.js';

const MODEL_TYPE = 'xgb_pd';
const ARTIFACT_FILES = ['xgb.json', 'feature_meta.json', 'manifest.json'];

async function main() {
  const artifactDir = process.argv[2];
  const apply = process.argv.includes('--apply');
  // --candidate: registra la versión como 'candidate' (no sirve tráfico, no degrada la
  // production actual). Lo usa el workflow de CI (#33); la promoción a production es manual.
  const lifecycle = process.argv.includes('--candidate') ? 'candidate' : 'production';
  if (!artifactDir) {
    console.error('Uso: promote-model.ts <artifactDir> [--candidate] [--apply]');
    process.exit(1);
  }

  for (const f of ARTIFACT_FILES) {
    if (!fs.existsSync(path.join(artifactDir, f))) {
      console.error(`Falta ${f} en ${artifactDir} — ¿entrenaste con train_xgb.py?`);
      process.exit(1);
    }
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'manifest.json'), 'utf-8'));
  const auc = Number(manifest?.metrics?.auc ?? 0);
  const datasetHash = manifest?.dataset_hash ?? null;
  const modelId = String(manifest?.model_id ?? `xgb_${Date.now()}`);
  const keyPrefix = `models/${MODEL_TYPE}/${modelId}`;

  console.log(`[promote-model] modelId=${modelId} auc=${auc.toFixed(4)} keyPrefix=${keyPrefix} lifecycle=${lifecycle} mode=${apply ? 'APPLY' : 'dry-run'}`);

  if (auc < 0.6) {
    console.error(`[promote-model] AUC ${auc.toFixed(4)} < 0.60 — abortando (no se registra un modelo peor que el umbral).`);
    process.exit(1);
  }

  if (!apply) {
    console.log(`[promote-model] dry-run: subiría los 3 artefactos al blob store y registraría esta versión como '${lifecycle}'. Re-ejecuta con --apply.`);
    return;
  }

  const store = getBlobStore();
  for (const f of ARTIFACT_FILES) {
    const bytes = fs.readFileSync(path.join(artifactDir, f));
    const uri = await store.putObject(`${keyPrefix}/${f}`, bytes, { contentType: 'application/json' });
    console.log(`  subido ${f} -> ${uri}`);
  }

  // Solo al promover a production se degrada la production anterior a 'archived'.
  if (lifecycle === 'production') {
    await db
      .update(algorithmModelVersions)
      .set({ lifecycle: 'archived', isActive: 0 })
      .where(and(eq(algorithmModelVersions.lifecycle, 'production'), eq(algorithmModelVersions.modelType, MODEL_TYPE)));
  }

  await db.insert(algorithmModelVersions).values({
    id: randomUUID(),
    modelType: MODEL_TYPE,
    version: modelId,
    deployedAt: new Date().toISOString(),
    deployedBy: 'promote-model.ts',
    isActive: lifecycle === 'production' ? 1 : 0,
    lifecycle,
    artifactUri: keyPrefix,
    auc,
    datasetHash,
    changelog: `Registrado '${lifecycle}' desde ${artifactDir} (auc=${auc.toFixed(4)})`,
  });

  console.log(
    lifecycle === 'production'
      ? '[promote-model] OK: nueva versión marcada production. El serving la tomará en el próximo boot o reload del registry.'
      : "[promote-model] OK: versión registrada como 'candidate'. Promuévela manualmente (sin --candidate) cuando la valides.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[promote-model] error:', err);
    process.exit(1);
  });
