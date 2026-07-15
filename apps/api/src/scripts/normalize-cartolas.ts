/**
 * Backfill: normaliza las cartolas YA subidas (score_document_uploads) a
 * accounts/transactions. Idempotente — reusa el external_id determinístico, así
 * que re-correrlo no duplica (normalizeCartolaDoc borra y reinserta por doc).
 *
 * Uso (desde la raíz del monorepo):
 *   DATABASE_URL="postgresql://..." npm run db:normalize-cartolas -w @coda/api
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

interface ScoreDocRow {
  id: string;
  userId: string;
  banco: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  parsedData: string | { transacciones?: unknown[] } | null;
}

async function main() {
  console.log("🔁 Normalización de cartolas → accounts/transactions");

  const { db, scoreDocumentUploads } = await import("../db/index.js");
  const { normalizeCartolaDoc } = await import("../services/documents/normalizeCartola.js");

  const docs = (await db
    .select()
    .from(scoreDocumentUploads)
    .where(eq(scoreDocumentUploads.tipo, "cartola"))) as unknown as ScoreDocRow[];

  console.log(`📄 ${docs.length} cartola(s) en score_document_uploads.`);

  let totalTx = 0;
  const byProduct = new Map<string, number>();
  const accountsTouched = new Set<number>();

  for (const doc of docs) {
    let pd: { transacciones?: unknown[] } | null;
    try {
      pd =
        typeof doc.parsedData === "string"
          ? JSON.parse(doc.parsedData)
          : (doc.parsedData as { transacciones?: unknown[] } | null);
    } catch {
      console.warn(`  ⚠️  ${doc.id}: parsedData no parseable, se omite.`);
      continue;
    }
    const transacciones = (pd?.transacciones ?? []) as never[];
    if (!Array.isArray(transacciones) || transacciones.length === 0) continue;

    const r = await normalizeCartolaDoc({
      userId: doc.userId,
      documentId: doc.id,
      banco: doc.banco,
      periodoDesde: doc.periodoDesde,
      periodoHasta: doc.periodoHasta,
      transacciones,
    });
    if (!r) continue;
    totalTx += r.inserted;
    accountsTouched.add(r.accountId);
    byProduct.set(doc.banco ?? "?", (byProduct.get(doc.banco ?? "?") ?? 0) + r.inserted);
  }

  console.log(`\n✅ ${accountsTouched.size} cuenta(s), ${totalTx} transacción(es) normalizadas.`);
  for (const [banco, n] of [...byProduct.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${banco}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ normalize-cartolas falló:", e);
  process.exit(1);
});
