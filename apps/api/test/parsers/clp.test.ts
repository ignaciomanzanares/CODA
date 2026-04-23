import { describe, it, expect } from "vitest";
import { parseCLP, formatCLP } from "../../src/utils/clp.js";

describe("parseCLP", () => {
  // ── Core Chilean-format cases ──────────────────────────────────────────────
  it("parses thousands-separated integer (3 digits)", () => {
    expect(parseCLP("973.959")).toBe(973959);
  });

  it("parses thousands-separated integer (6 digits)", () => {
    expect(parseCLP("1.234.567")).toBe(1234567);
  });

  it("parses 4-digit thousands-separated amount", () => {
    expect(parseCLP("50.000")).toBe(50000);
  });

  it("parses amount with dollar sign and spaces", () => {
    expect(parseCLP("$ 1.200")).toBe(1200);
  });

  it("parses amount with decimal comma (rare CLP)", () => {
    expect(parseCLP("50.000,50")).toBe(50001);
  });

  it("parses 7-digit amount", () => {
    expect(parseCLP("1.764.363")).toBe(1764363);
  });

  it("parses saldo_inicial from cartola01-26", () => {
    expect(parseCLP("973.959")).toBe(973959);
  });

  it("parses saldo_final from cartola01-26", () => {
    expect(parseCLP("405.125")).toBe(405125);
  });

  it("parses total_cargos from cartola01-26", () => {
    expect(parseCLP("2.333.197")).toBe(2333197);
  });

  // ── Passthrough for already-numeric values ─────────────────────────────────
  it("returns integer as-is when passed a number", () => {
    expect(parseCLP(973959)).toBe(973959);
  });

  it("rounds float number", () => {
    expect(parseCLP(50000.5)).toBe(50001);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it("returns 0 for null", () => {
    expect(parseCLP(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(parseCLP(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseCLP("")).toBe(0);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parseCLP("abc")).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(parseCLP(NaN)).toBe(0);
  });

  it("parses bare integer string without separators", () => {
    expect(parseCLP("12345")).toBe(12345);
  });

  it("parses small amount (2 digits)", () => {
    expect(parseCLP("99")).toBe(99);
  });

  it("strips whitespace around the string", () => {
    expect(parseCLP("  50.000  ")).toBe(50000);
  });

  // ── The canonical bug case ─────────────────────────────────────────────────
  it("does NOT interpret dot as decimal point (the core bug)", () => {
    // parseFloat("973.959") → 973.959 (wrong); parseCLP → 973959
    const bugValue = parseFloat("973.959");
    expect(bugValue).toBeCloseTo(973.959); // confirm the bug exists in raw parseFloat
    expect(parseCLP("973.959")).toBe(973959); // confirm parseCLP is correct
  });
});

describe("formatCLP", () => {
  it("formats with Chilean locale dot-separated thousands", () => {
    // es-CL locale uses dots for thousands
    expect(formatCLP(973959)).toMatch(/973[\.,]959/);
  });

  it("starts with dollar sign", () => {
    expect(formatCLP(1234)).toMatch(/^\$/);
  });
});
