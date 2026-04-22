/**
 * Tests para detectFormat y assertFormatDetected.
 *
 * Usa texto sintético que imita la salida de pdf-parse de cartolas reales.
 * No requiere PDFs reales ni carga de pdfjs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { detectFormat, assertFormatDetected } from "../../src/parsers/detectFormat.js";
import { ParseError } from "../../src/parsers/base.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../fixtures/cartolas");

function loadFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf-8");
}

// ── detectFormat ──────────────────────────────────────────────────────────────

describe("detectFormat", () => {
  it("detecta Santander con alta confianza", () => {
    const text = loadFixture("santander.txt");
    const result = detectFormat(text);
    expect(result.banco).toBe("Santander");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.markers.length).toBeGreaterThan(0);
  });

  it("detecta BCI con alta confianza", () => {
    const text = loadFixture("bci.txt");
    const result = detectFormat(text);
    expect(result.banco).toBe("BCI");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detecta BancoEstado con alta confianza", () => {
    const text = loadFixture("bancoestado.txt");
    const result = detectFormat(text);
    expect(result.banco).toBe("BancoEstado");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detecta Banco de Chile con alta confianza", () => {
    const text = loadFixture("bancodechile.txt");
    const result = detectFormat(text);
    expect(result.banco).toBe("Banco de Chile");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("devuelve confianza baja para texto sin banco conocido", () => {
    const text = "Este es un texto cualquiera sin nombre de banco.";
    const result = detectFormat(text);
    expect(result.confidence).toBeLessThan(0.85);
  });

  it("penaliza documentos sin contenido de transacciones", () => {
    // Solo el nombre del banco, sin movimientos
    const text = "BANCO SANTANDER S.A. Santiago de Chile";
    const result = detectFormat(text);
    // Debe detectar Santander pero con confianza reducida por falta de contenido transaccional
    expect(result.banco).toBe("Santander");
    expect(result.confidence).toBeLessThan(0.90);
  });

  it("no confunde BancoEstado con texto que dice 'estado'", () => {
    const text = "Estado de cuenta de un banco genérico sin nombre.";
    const result = detectFormat(text);
    // No debe detectar BancoEstado solo por la palabra "estado"
    expect(result.banco).not.toBe("BancoEstado");
  });
});

// ── assertFormatDetected ──────────────────────────────────────────────────────

describe("assertFormatDetected", () => {
  it("no lanza error cuando confianza >= 0.85", () => {
    const text = loadFixture("santander.txt");
    const detected = detectFormat(text);
    expect(() => assertFormatDetected(detected)).not.toThrow();
  });

  it("lanza ParseError FORMAT_UNKNOWN cuando confianza < 0.85", () => {
    const detected = {
      banco: "Desconocido",
      confidence: 0.40,
      markers: [],
    };
    expect(() => assertFormatDetected(detected)).toThrowError(ParseError);
    try {
      assertFormatDetected(detected);
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).code).toBe("FORMAT_UNKNOWN");
      expect((e as ParseError).messageEs).toContain("banco");
    }
  });

  it("el mensaje de error está en español", () => {
    const detected = { banco: "Desconocido", confidence: 0.20, markers: [] };
    try {
      assertFormatDetected(detected);
    } catch (e) {
      const err = e as ParseError;
      // Mensaje debe mencionar bancos compatibles
      expect(err.messageEs).toMatch(/Santander|BCI|Banco de Chile|BancoEstado/);
    }
  });
});
