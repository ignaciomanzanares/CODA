/**
 * Backfill idempotente: re-categoriza las transacciones de cartola ya
 * almacenadas cuando el diccionario o la versión del motor cambian.
 *
 * No inventa datos: sólo vuelve a correr las reglas deterministas de
 * `merchantCategorizer` sobre las glosas existentes y persiste la categoría,
 * su confianza y la trazabilidad (regla + versión). Re-ejecutarlo sin cambios
 * en el motor produce 0 actualizaciones.
 *
 * Uso (desde la raíz del monorepo):
 *   DATABASE_URL="postgresql://..." npm run db:recategorize -w @coda/api
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { categorize, TAXONOMY, CATEGORIZER_VERSION } from "../parsers/merchantCategorizer.js";

// El módulo db/index lee DATABASE_URL al importarse, así que el .env debe
// cargarse ANTES. Por el hoisting de imports ESM, db se importa de forma
// dinámica dentro de main() (tras este config), no como import estático.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

interface StoredTx {
  descripcion?: string;
  tipo?: "cargo" | "abono";
  monto?: number;
  cargo?: number;
  abono?: number;
  categoria?: string;
  category?: string;
  subcategory?: string;
  category_confidence?: number;
  category_rule_id?: string;
  categorizer_version?: string;
  essential?: boolean;
  recurring?: boolean;
  excluded?: boolean;
  es_transferencia?: boolean;
  [k: string]: unknown;
}

function bump(dist: Map<string, number>, key: string) {
  dist.set(key, (dist.get(key) ?? 0) + 1);
}

function printDist(label: string, dist: Map<string, number>, total: number) {
  console.log(`\n${label} (${total} tx):`);
  for (const [cat, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${String(n).padStart(5)}  ${pct.padStart(5)}%  ${cat}`);
  }
}

async function main() {
  console.log(`🔁 Recategorización — motor ${CATEGORIZER_VERSION}`);

  // Import dinámico: garantiza que DATABASE_URL ya esté en el entorno cuando
  // db/index inicializa su conexión (evita el fallback a SQLite).
  const { db, documentUploads } = await import("../db/index.js");

  const docs = await db
    .select()
    .from(documentUploads)
    .where(eq(documentUploads.tipo, "cartola"));

  console.log(`📄 ${docs.length} cartola(s) encontradas.`);

  const before = new Map<string, number>();
  const after = new Map<string, number>();
  let totalTx = 0;
  let changedTx = 0;
  let changedDocs = 0;
  // Conteo específico del fix: ingreso mal categorizado → 'Transferencia interna'.
  let ingresoToInterna = 0;

  for (const doc of docs) {
    let pd: { transacciones?: StoredTx[] } | null;
    try {
      pd = JSON.parse(doc.parsedData) as { transacciones?: StoredTx[] };
    } catch {
      continue;
    }
    if (!pd?.transacciones?.length) continue;

    let docChanged = false;
    for (const tx of pd.transacciones) {
      if (!tx.descripcion) continue;
      totalTx++;
      bump(before, tx.category ?? "—");

      // Soporta formato nuevo (tipo/monto) y heredado (cargo/abono).
      const tipo: "cargo" | "abono" =
        tx.tipo ?? ((tx.abono ?? 0) > 0 ? "abono" : "cargo");
      const monto =
        tx.monto ?? ((tx.abono ?? 0) > 0 ? tx.abono ?? 0 : tx.cargo ?? 0);

      // Honra la señal del adaptador de tarjeta (es_transferencia) además de la glosa.
      const r = categorize({ descripcion: tx.descripcion, monto, tipo, internalTransfer: tx.es_transferencia === true });
      // Las internas se PERSISTEN como 'Transferencia interna' (no el slug legacy
      // 'otro') para que isInternalTransferTx las excluya por `categoria`.
      const newCategoria =
        r.category === 'Transferencia interna' ? 'Transferencia interna' : TAXONOMY[r.category].legacy;

      bump(after, r.category);

      if (
        tx.category !== r.category ||
        tx.category_rule_id !== r.ruleId ||
        tx.categorizer_version !== r.version ||
        tx.categoria !== newCategoria ||
        (r.category === 'Transferencia interna' && tx.es_transferencia !== true)
      ) {
        const prevCategoria = tx.categoria;
        tx.categoria = newCategoria;
        tx.category = r.category;
        tx.subcategory = r.subcategory;
        tx.category_confidence = r.confidence;
        tx.category_rule_id = r.ruleId;
        tx.categorizer_version = r.version;
        tx.essential = r.essential;
        tx.recurring = r.recurring || tx.recurring === true;
        tx.excluded = r.excluded;
        if (r.category === 'Transferencia interna') tx.es_transferencia = true;
        if (prevCategoria === 'ingreso_principal' && newCategoria === 'Transferencia interna') ingresoToInterna++;
        docChanged = true;
        changedTx++;
      }
    }

    if (docChanged) {
      await db
        .update(documentUploads)
        .set({ parsedData: JSON.stringify(pd) })
        .where(eq(documentUploads.id, doc.id));
      changedDocs++;
    }
  }

  printDist("ANTES", before, totalTx);
  printDist("DESPUÉS", after, totalTx);

  console.log(
    `\n🔄 ${ingresoToInterna} tx reclasificadas de 'ingreso_principal' → 'Transferencia interna'` +
      ` (pago de tarjeta / divisas / fondeo a T. Crédito).`,
  );

  const known = totalTx - (after.get("Otro") ?? 0);
  const coverage = totalTx > 0 ? ((known / totalTx) * 100).toFixed(1) : "0.0";
  console.log(
    `\n✅ ${changedTx} tx actualizadas en ${changedDocs} documento(s).` +
      ` Cobertura (no-"Otro"): ${coverage}%.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ recategorize falló:", e);
  process.exit(1);
});
