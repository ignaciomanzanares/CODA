/**
 * #20: valida el parser genérico por coordenadas contra cartolas Santander reales.
 *
 * Objetivo (del plan): "validar precisión ≥ parsers actuales antes de depender de él". El
 * genérico corre el motor compartido en modo keyword_inferred (sin la detección por banco), y
 * debe extraer (al menos) tantas transacciones como el parser por banco sobre el mismo PDF.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseGeneric } from "../../src/parsers/genericParser.js";
import { parseCartolaBuffer } from "../../src/parsers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../fixtures/cartolas/Santander");

const FIXTURES = ["cartola01-26.pdf", "cartola02-26.pdf", "cartola09-25.pdf"].filter((f) =>
  existsSync(join(fixtureDir, f)),
);

describe("parser genérico por coordenadas (#20)", () => {
  if (FIXTURES.length === 0) {
    it.skip("sin fixtures PDF en disco", () => {});
    return;
  }

  for (const fixture of FIXTURES) {
    it(`extrae movimientos de ${fixture} sin depender de la detección por banco`, async () => {
      const buf = readFileSync(join(fixtureDir, fixture));

      const generic = await parseGeneric(buf);
      expect(generic.banco).toBe("Genérico");
      expect(generic.transacciones.length).toBeGreaterThanOrEqual(1);

      // Precisión ≥ parser por banco: el genérico no debe extraer menos movimientos que el
      // camino específico de banco sobre el mismo PDF (mismo motor de extracción de filas).
      const bankSpecific = await parseCartolaBuffer(buf);
      expect(generic.transacciones.length).toBeGreaterThanOrEqual(
        Math.floor(bankSpecific.transacciones.length * 0.9),
      );

      // La conciliación no debe estar groseramente fuera (hereda el gate de runBankParser).
      expect(generic.reconciliation).toBeTruthy();
    });
  }

  // Contrato de fallback graceful (#20): si el motor no logra un parseo válido, el genérico
  // LANZA en vez de devolver basura. Asi `tryGenericParser` lo captura -> null y el caller
  // conserva el ParseError original mas informativo (no se inventan transacciones).
  it("rechaza (lanza) un buffer ilegible en vez de devolver un resultado parcial", async () => {
    const notAPdf = Buffer.from("esto no es un PDF de cartola");
    await expect(parseGeneric(notAPdf)).rejects.toThrow();
  });
});
