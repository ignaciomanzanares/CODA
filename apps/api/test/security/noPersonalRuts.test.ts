/**
 * Guarda D8: ningún archivo versionado puede contener el RUT de una persona real.
 *
 * El repo es PÚBLICO. Ya se colaron un informe CMF con nombre completo + RUT y nombres de
 * terceros sacados de cartolas reales, y un commit posterior no borra el historial. Esta guarda
 * no puede detectar nombres, pero sí RUTs: todo RUT de persona (< 50.000.000) con dígito
 * verificador VÁLIDO tiene que ser uno de los sintéticos de `test/helpers/testRuts.ts`.
 *
 * Límite conocido: un RUT real con el dígito verificador alterado pasa. Por eso la regla del
 * README de fixtures es rotar dígitos, no sólo cambiar el verificador.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_SYNTHETIC_PERSON_RUT_BODIES, TEST_RUTS, rutCheckDigit } from "../helpers/testRuts";

/** Desde 50.000.000 son personas jurídicas: el RUT de una empresa no es dato personal. */
const PERSON_RUT_MAX = 50_000_000;
const BINARY = /\.(pdf|png|jpe?g|gif|webp|ico|svg|onnx|db|sqlite|woff2?|ttf|otf|zip|gz|mp4)$/i;
const SKIP = /(^|\/)(package-lock\.json|node_modules\/|dist\/|\.git\/)/;
const RUT_RE = /\b(\d{1,2})\.?(\d{3})\.?(\d{3})-([\dkK])\b/g;

export interface PersonalRutHit {
  line: number;
  masked: string;
}

/** RUTs de persona con dígito verificador válido que NO están en la lista de sintéticos. */
export function findPersonalRuts(text: string): PersonalRutHit[] {
  const hits: PersonalRutHit[] = [];
  const lines = text.split("\n");
  lines.forEach((content, i) => {
    for (const m of content.matchAll(RUT_RE)) {
      const body = m[1] + m[2] + m[3];
      if (Number(body) >= PERSON_RUT_MAX) continue;
      if (rutCheckDigit(body) !== m[4].toUpperCase()) continue;
      if (ALLOWED_SYNTHETIC_PERSON_RUT_BODIES.has(body.padStart(8, "0"))) continue;
      // Enmascarado: el mensaje de error no debe re-exponer el RUT en logs de CI.
      hits.push({ line: i + 1, masked: `${body.slice(0, 2)}.xxx.xxx-x` });
    }
  });
  return hits;
}

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function trackedTextFiles(): string[] {
  let files: string[];
  try {
    files = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" }).split("\n");
  } catch {
    // Sin git (p. ej. un tarball): recorrer el disco.
    files = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name);
        const rel = path.relative(repoRoot, abs);
        if (SKIP.test(rel + (statSync(abs).isDirectory() ? "/" : ""))) continue;
        if (statSync(abs).isDirectory()) walk(abs);
        else files.push(rel);
      }
    };
    walk(repoRoot);
  }
  return files.filter((f) => f && !BINARY.test(f) && !SKIP.test(f));
}

describe("D8 — sin RUTs de personas reales en el repo", () => {
  it("los RUTs de prueba tienen dígito verificador válido", () => {
    for (const rut of Object.values(TEST_RUTS)) {
      const [body, dv] = rut.replace(/\./g, "").split("-");
      expect(rutCheckDigit(body)).toBe(dv);
    }
  });

  it("detecta un RUT de persona no sintético, y deja pasar sintéticos, empresas y DV inválidos", () => {
    // Construido en tiempo de ejecución para que el literal nunca quede escrito en el repo.
    const body = "10000000";
    const real = `10.000.000-${rutCheckDigit(body)}`;
    const wrongDv = `10.000.000-${rutCheckDigit(body) === "1" ? "2" : "1"}`;

    expect(findPersonalRuts(`titular ok\nrut: "${real}"`)).toEqual([
      { line: 2, masked: "10.xxx.xxx-x" },
    ]);
    expect(findPersonalRuts(`${TEST_RUTS.persona} ${TEST_RUTS.empresa} ${wrongDv}`)).toEqual([]);
  });

  it("ningún archivo versionado trae un RUT de persona fuera de la lista de sintéticos", () => {
    const offenders: string[] = [];
    for (const rel of trackedTextFiles()) {
      let text: string;
      try {
        text = readFileSync(path.join(repoRoot, rel), "utf8");
      } catch {
        continue;
      }
      for (const hit of findPersonalRuts(text)) offenders.push(`${rel}:${hit.line}  ${hit.masked}`);
    }

    expect(
      offenders,
      "RUT de persona real en el repo (público). Reemplázalo por TEST_RUTS de " +
        "test/helpers/testRuts.ts; si es sintético a propósito, agrégalo a " +
        "ALLOWED_SYNTHETIC_PERSON_RUT_BODIES con un comentario.",
    ).toEqual([]);
  });
});
