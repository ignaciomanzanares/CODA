import { and, eq, isNull, type SQL } from "drizzle-orm";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Cargar .env ANTES de importar ../db/index.js (que lee DATABASE_URL al cargarse,
// con fallback a SQLite local si falta). Por eso el import de db es dinámico y va
// dentro de main(); con un import estático arriba, ESM lo ejecutaría antes de este
// config() y el script correría contra una SQLite vacía (scanned=0). Ver normalize-cartolas.ts.
config({ path: path.join(__dirname, "../../.env") });

interface ScoreDocRow {
  id: string;
  userId: string;
  tipo: string;
  banco: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  sourceDocumentUploadId: string | null;
}

interface DocumentRow {
  id: string;
  userId: string;
  tipo: string;
  banco: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
}

function nullableEq(column: any, value: string | null): SQL {
  return value == null ? isNull(column) : eq(column, value);
}

async function main() {
  const { db, documentUploads, scoreDocumentUploads } = await import("../db/index.js");
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";
  const scores = (await db
    .select()
    .from(scoreDocumentUploads)
    .where(
      and(
        eq(scoreDocumentUploads.tipo, "cartola"),
        isNull(scoreDocumentUploads.sourceDocumentUploadId),
      ),
    )) as ScoreDocRow[];

  let linked = 0;
  let missing = 0;
  let ambiguous = 0;

  for (const scoreDoc of scores) {
    const matches = (await db
      .select()
      .from(documentUploads)
      .where(
        and(
          eq(documentUploads.userId, scoreDoc.userId),
          eq(documentUploads.tipo, scoreDoc.tipo),
          nullableEq(documentUploads.banco, scoreDoc.banco),
          nullableEq(documentUploads.periodoDesde, scoreDoc.periodoDesde),
          nullableEq(documentUploads.periodoHasta, scoreDoc.periodoHasta),
        ),
      )) as DocumentRow[];

    if (matches.length === 1) {
      linked += 1;
      if (!dryRun) {
        await db
          .update(scoreDocumentUploads)
          .set({ sourceDocumentUploadId: matches[0].id })
          .where(eq(scoreDocumentUploads.id, scoreDoc.id));
      }
      continue;
    }

    if (matches.length === 0) {
      missing += 1;
      console.warn(
        `[missing] score=${scoreDoc.id} user=${scoreDoc.userId} banco=${scoreDoc.banco} periodo=${scoreDoc.periodoDesde}..${scoreDoc.periodoHasta}`,
      );
    } else {
      ambiguous += 1;
      console.warn(
        `[ambiguous] score=${scoreDoc.id} user=${scoreDoc.userId} candidates=${matches.map((m) => m.id).join(",")}`,
      );
    }
  }

  console.log(
    JSON.stringify({ dryRun, scanned: scores.length, linked, missing, ambiguous }, null, 2),
  );
}

main().catch((error) => {
  console.error("backfill-source-document-upload-links failed", error);
  process.exit(1);
});
