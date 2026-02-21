#!/usr/bin/env node
/**
 * Añade la columna dte_document_id a empresas_purchase_orders (SQLite).
 * Ejecutar una vez si db:push falla con "no such column: dte_document_id".
 * Uso: desde la raíz del repo: node scripts/add-po-dte-column.mjs
 *      o: SQLITE_PATH=/ruta/a/coda.db node scripts/add-po-dte-column.mjs
 */
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const defaultPath = join(root, "packages", "data", "coda.db");
const dbPath = process.env.SQLITE_PATH || defaultPath;

if (!existsSync(dbPath)) {
  console.error("No se encontró la base SQLite en:", dbPath);
  console.error("Configure SQLITE_PATH o cree la DB antes (npm run db:push con DB vacía).");
  process.exit(1);
}

const db = new Database(dbPath);

try {
  const tableInfo = db.prepare("PRAGMA table_info(empresas_purchase_orders)").all();
  const hasColumn = tableInfo.some((c) => c.name === "dte_document_id");
  if (hasColumn) {
    console.log("La columna dte_document_id ya existe en empresas_purchase_orders. Nada que hacer.");
  } else {
    db.exec("ALTER TABLE empresas_purchase_orders ADD COLUMN dte_document_id INTEGER");
    console.log("Columna dte_document_id añadida a empresas_purchase_orders.");
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
} finally {
  db.close();
}
