#!/usr/bin/env node
/**
 * Script de traducción automática usando la API de DeepL.
 * Genera en.json a partir de es.json (o traduce entre cualquier par de idiomas).
 *
 * Uso:
 *   DEEPL_AUTH_KEY=tu_api_key node apps/web/scripts/translate-auto.mjs
 *   DEEPL_AUTH_KEY=tu_api_key node apps/web/scripts/translate-auto.mjs --source en --target es
 *
 * Obtén una API key gratuita en: https://www.deepl.com/pro-api
 * (Plan free: 500.000 caracteres/mes)
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "../src/locales");

const args = process.argv.slice(2);
const sourceLang = args.includes("--source") ? args[args.indexOf("--source") + 1] : "es";
const targetLang = args.includes("--target") ? args[args.indexOf("--target") + 1] : "en";

const DEEPL_KEY = process.env.DEEPL_AUTH_KEY;
const DEEPL_API = DEEPL_KEY?.startsWith(":") ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else if (typeof v === "string") {
      out[key] = v;
    }
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let current = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!current[p]) current[p] = {};
      current = current[p];
    }
    current[parts[parts.length - 1]] = value;
  }
  return out;
}

async function translateText(text, sourceLangCode, targetLangCode) {
  const source = sourceLangCode.toUpperCase() === "EN" ? "EN" : sourceLangCode.toUpperCase() === "ES" ? "ES" : sourceLangCode.toUpperCase();
  const target = targetLangCode.toUpperCase() === "EN" ? "EN" : targetLangCode.toUpperCase() === "ES" ? "ES" : targetLangCode.toUpperCase();
  const form = new URLSearchParams({
    text: text,
    source_lang: source,
    target_lang: target,
  });
  const res = await fetch(DEEPL_API, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepL API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.translations?.[0]?.text ?? text;
}

async function main() {
  if (!DEEPL_KEY) {
    console.error("Falta DEEPL_AUTH_KEY. Uso: DEEPL_AUTH_KEY=tu_key node scripts/translate-auto.mjs");
    console.error("API key gratuita: https://www.deepl.com/pro-api");
    process.exit(1);
  }

  const sourcePath = join(LOCALES_DIR, `${sourceLang}.json`);
  const targetPath = join(LOCALES_DIR, `${targetLang}.json`);

  let sourceJson;
  try {
    sourceJson = JSON.parse(readFileSync(sourcePath, "utf-8"));
  } catch (e) {
    console.error(`No se pudo leer ${sourcePath}:`, e.message);
    process.exit(1);
  }

  const flat = flatten(sourceJson);
  const keys = Object.keys(flat);
  console.log(`Traduciendo ${keys.length} cadenas de ${sourceLang} → ${targetLang}...`);

  const translated = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const text = flat[key];
    try {
      translated[key] = await translateText(text, sourceLang, targetLang);
      console.log(`  [${i + 1}/${keys.length}] ${key}`);
    } catch (e) {
      console.warn(`  Fallo en "${key}": ${e.message}. Se mantiene el original.`);
      translated[key] = text;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  const result = unflatten(translated);
  writeFileSync(targetPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  console.log(`\nListo. Escrito en ${targetPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
