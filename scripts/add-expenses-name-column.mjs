#!/usr/bin/env node
/**
 * Añade la columna name a la tabla expenses (SQLite local).
 * Ejecutar: node scripts/add-expenses-name-column.mjs
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
  process.exit(1);
}

const db = new Database(dbPath);

try {
  const tableInfo = db.prepare("PRAGMA table_info(expenses)").all();
  const hasColumn = tableInfo.some((c) => c.name === "name");
  if (hasColumn) {
    console.log("✅ La columna name ya existe en expenses. Nada que hacer.");
  } else {
    db.exec("ALTER TABLE expenses ADD COLUMN name TEXT");
    console.log("✅ Columna name añadida a expenses.");
  }
} catch (e) {
  console.error("❌ Error:", e.message);
  process.exit(1);
} finally {
  db.close();
}
