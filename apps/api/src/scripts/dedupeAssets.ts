/**
 * Limpieza segura de activos DUPLICADOS (Deuda/Activos inflado al 47%).
 *
 * El viejo flujo de edición roto hacía que el usuario borrara y re-creara un
 * activo, dejando filas huérfanas idénticas. La agregación es correcta; el
 * problema son esas filas repetidas. Este script SÓLO elimina duplicados exactos
 * (misma firma de identidad) — nunca fabrica ni adivina datos, nunca toca activos
 * legítimamente distintos.
 *
 * Idempotente y DRY-RUN por defecto:
 *   - sin flags / --dry-run : imprime grupos, qué se conservaría vs. eliminaría y
 *     el total_assets + ratio Deuda/Activos ANTES/DESPUÉS. No borra nada.
 *   - --apply               : elimina los duplicados y escribe un audit_log por
 *     fila (NCG 502: quién/qué/cuándo/por qué).
 *   - --user <id>           : limita a un usuario (correr primero para Thomas).
 *
 * Uso (desde la raíz del monorepo):
 *   DATABASE_URL="postgresql://..." npm run db:dedupe-assets -w @coda/api -- --user <id>
 *   DATABASE_URL="postgresql://..." npm run db:dedupe-assets -w @coda/api -- --user <id> --apply
 *
 * Mantiene UNA fila por grupo: la más COMPLETA (con estimatedValue o garantía);
 * a igualdad, la más antigua (menor createdAt / id estable).
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

const SCRIPT_VERSION = "dedupeAssets.v1";

interface AssetRow {
  id: string;
  userId: string;
  type: string;
  name: string;
  acquisitionCostClp: number;
  estimatedValueClp: number | null;
  hasLien: number | boolean;
  lienAmountClp: number | null;
  currency: string;
  documentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function fmt(n: number): string {
  return n.toLocaleString("es-CL");
}

// "Más completa": tiene valor estimado o garantía declarada → más información.
function completeness(a: AssetRow): number {
  return (a.estimatedValueClp != null ? 1 : 0) + (a.lienAmountClp != null ? 1 : 0);
}

// Elige la fila a CONSERVAR dentro de un grupo de duplicados.
function pickKeeper(group: AssetRow[]): AssetRow {
  return [...group].sort((a, b) => {
    const c = completeness(b) - completeness(a);
    if (c !== 0) return c; // primero la más completa
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1; // luego la más antigua
    return a.id < b.id ? -1 : 1; // desempate estable por id
  })[0];
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const dryRun = !apply; // dry-run por defecto
  const userFlagIdx = argv.indexOf("--user");
  const onlyUser = userFlagIdx >= 0 ? argv[userFlagIdx + 1] : undefined;

  console.log(
    `🧹 Dedup de activos — ${SCRIPT_VERSION} — ${dryRun ? "DRY-RUN (no borra nada)" : "APPLY (elimina + audita)"}`,
  );
  if (onlyUser) console.log(`   Limitado al usuario: ${onlyUser}`);

  // Import dinámico: el .env ya está cargado antes de inicializar db/index.
  const { db, userAssets, auditLogs } = await import("../db/index.js");
  const { storage } = await import("../storage.js");
  const { eq } = await import("drizzle-orm");
  const { effectiveAssetValueClp, assetSignature } = await import("../services/assets/types.js");
  const { deriveHealthInput } = await import("../services/healthEvaluation/index.js");

  // Ratio Deuda/Activos para un conjunto de activos, reutilizando la fórmula
  // canónica deriveHealthInput (no se duplica matemática). La deuda total sale
  // del CMF más reciente y los líquidos del score transaccional, igual que el
  // endpoint /health. deudaMensual no afecta deudaActivos (proxy /36).
  async function deudaActivosFor(userId: string, assets: AssetRow[]): Promise<number | null> {
    const [txScore, cmfNew, cmfLegacy, cartolas] = await Promise.all([
      storage.getTransactionalScore(userId),
      storage.listDocumentUploadsByType(userId, "cmf"),
      storage.listDocumentUploadsByType(userId, "cmf_informe_deudas"),
      storage.listDocumentUploadsByType(userId, "cartola"),
    ]);
    const cmfDocs = [...cmfNew, ...cmfLegacy].sort(
      (a: any, b: any) =>
        new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime(),
    );
    if (cmfDocs.length === 0) return null;
    const raw = (cmfDocs[0] as any)?.parsedData;
    const deudaTotalClp: number =
      typeof raw?.deuda_total === "number" ? raw.deuda_total : (raw?.deudaTotalVigente ?? 0);

    const pd = (cartolas[0] as any)?.parsedData as { transacciones?: any[] } | null;
    let ingresos = 0,
      gastos = 0;
    for (const t of pd?.transacciones ?? []) {
      if (t.tipo === "abono" && typeof t.monto === "number") ingresos += t.monto;
      else if (t.tipo === "cargo" && typeof t.monto === "number") gastos += t.monto;
      else {
        ingresos += t.abono ?? 0;
        gastos += t.cargo ?? 0;
      }
    }

    const out = deriveHealthInput({
      ingresoMensualClp: ingresos,
      deudaMensualClp: deudaTotalClp / 36,
      deudaTotalClp,
      ahorroMensualClp: ingresos - gastos,
      cmf: {
        deuda_total: deudaTotalClp,
        deuda_directa: [],
        deuda_indirecta: [],
        lineas_credito: [],
        metricas: {
          porcentaje_al_dia: 100,
          score_cmf: 85,
          tiene_mora: false,
          credito_disponible_total: 0,
          utilizacion_promedio: 0,
        },
      } as any,
      sfaAvgMonthlyBalanceClp: txScore?.metrics?.averageMonthlyBalanceClp ?? undefined,
      userAssets: assets.map((a) => ({
        ...a,
        hasLien: a.hasLien === 1 || a.hasLien === true,
      })) as any,
    });
    return out.deudaActivos;
  }

  // Usuarios objetivo.
  let userIds: string[];
  if (onlyUser) {
    userIds = [onlyUser];
  } else {
    const all = (await db.select().from(userAssets)) as AssetRow[];
    userIds = [...new Set(all.map((a) => a.userId))];
  }
  console.log(`👤 ${userIds.length} usuario(s) con activos a revisar.\n`);

  let totalGroups = 0,
    totalRemovable = 0,
    totalRemoved = 0;
  const removedAtIso = new Date().toISOString();

  for (const userId of userIds) {
    const assets = (await db
      .select()
      .from(userAssets)
      .where(eq(userAssets.userId, userId))) as AssetRow[];
    if (assets.length === 0) continue;

    // Agrupar por firma de identidad.
    const groups = new Map<string, AssetRow[]>();
    for (const a of assets) {
      const sig = assetSignature(a);
      (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(a);
    }
    const dupGroups = [...groups.values()].filter((g) => g.length > 1);
    if (dupGroups.length === 0) continue;

    const toRemove: AssetRow[] = [];
    console.log(
      `── Usuario ${userId} — ${assets.length} activos, ${dupGroups.length} grupo(s) duplicado(s):`,
    );
    for (const g of dupGroups) {
      totalGroups++;
      const keeper = pickKeeper(g);
      const remove = g.filter((a) => a.id !== keeper.id);
      toRemove.push(...remove);
      console.log(
        `   • "${keeper.name}" (${keeper.type}, costo ${fmt(keeper.acquisitionCostClp)}) ×${g.length}`,
      );
      console.log(
        `       KEEP   ${keeper.id}  valor=${fmt(effectiveAssetValueClp({ ...keeper, hasLien: false } as any))}`,
      );
      for (const r of remove) console.log(`       REMOVE ${r.id}  (creado ${r.createdAt})`);
    }
    totalRemovable += toRemove.length;

    // BEFORE/AFTER: total_assets declarados + ratio Deuda/Activos.
    const declaredBefore = assets.reduce(
      (s, a) => s + effectiveAssetValueClp({ ...a, hasLien: false } as any),
      0,
    );
    const keptAssets = assets.filter((a) => !toRemove.some((r) => r.id === a.id));
    const declaredAfter = keptAssets.reduce(
      (s, a) => s + effectiveAssetValueClp({ ...a, hasLien: false } as any),
      0,
    );
    const ratioBefore = await deudaActivosFor(userId, assets);
    const ratioAfter = await deudaActivosFor(userId, keptAssets);
    const pct = (r: number | null) =>
      r == null ? "n/a (faltan docs CMF)" : `${(r * 100).toFixed(1)}%`;
    console.log(`   total_assets declarados: ${fmt(declaredBefore)} → ${fmt(declaredAfter)}`);
    console.log(`   Deuda/Activos:           ${pct(ratioBefore)} → ${pct(ratioAfter)}`);

    if (apply) {
      for (const r of toRemove) {
        await db.delete(userAssets).where(eq(userAssets.id, r.id));
        await db.insert(auditLogs).values({
          userId,
          action: "asset_dedupe_remove",
          entity: "user_asset",
          entityId: r.id,
          timestamp: removedAtIso,
          details: JSON.stringify({
            reason: "duplicate_of",
            keptId: pickKeeper(groups.get(assetSignature(r))!).id,
            signature: assetSignature(r),
            removedRow: {
              name: r.name,
              type: r.type,
              acquisitionCostClp: r.acquisitionCostClp,
              estimatedValueClp: r.estimatedValueClp,
              lienAmountClp: r.lienAmountClp,
              createdAt: r.createdAt,
            },
            script: SCRIPT_VERSION,
          }),
          ip: null,
        });
        totalRemoved++;
      }
      console.log(`   ✅ ${toRemove.length} fila(s) eliminada(s) + auditadas.`);
    }
    console.log("");
  }

  console.log("──────────────────────────────────────────");
  if (dryRun) {
    console.log(
      `DRY-RUN: ${totalGroups} grupo(s) duplicado(s); ${totalRemovable} fila(s) se eliminarían. Nada fue borrado.`,
    );
    console.log(`Para aplicar: repetir con --apply.`);
  } else {
    console.log(
      `APPLY: ${totalRemoved} fila(s) eliminada(s) y auditada(s) en ${totalGroups} grupo(s).`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ dedupeAssets falló:", e);
  process.exit(1);
});
