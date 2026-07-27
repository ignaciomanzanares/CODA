import { describe, it, expect } from "vitest";
import {
  normalizeMerchant,
  categorize,
  CATEGORIZER_VERSION,
  type CategoryLabel,
} from "../merchantCategorizer.js";

describe("normalizeMerchant", () => {
  it("strips payment-processor prefixes", () => {
    expect(normalizeMerchant("PAYU *UBER TRIP")).toBe("UBER TRIP");
    expect(normalizeMerchant("MERPAGO*SPOTIFY")).toBe("SPOTIFY");
    expect(normalizeMerchant("SumUp *CAFE LASTARRIA")).toBe("CAFE LASTARRIA");
    expect(normalizeMerchant("DLO*NETFLIX")).toBe("NETFLIX");
  });

  it("strips a leading bare asterisk", () => {
    expect(normalizeMerchant("*UBER RIDE")).toBe("UBER RIDE");
  });

  it("strips trailing país code and glued currency on international rows", () => {
    expect(normalizeMerchant("LATAM.COM EUR LA")).toBe("LATAM.COM");
    expect(normalizeMerchant("OPENAI *CHATGPT SUBSCR IR")).toBe("OPENAI CHATGPT SUBSCR");
    expect(normalizeMerchant("LA CEVI DE")).toBe("LA CEVI");
  });

  it("strips branch/location noise and expands abbreviations", () => {
    expect(normalizeMerchant("STA ISABEL PROV BILBAO")).toBe("SANTA ISABEL");
    expect(normalizeMerchant("JUMBO SUC PROVIDENCIA")).toBe("JUMBO");
  });

  it("strips long store/serial numbers", () => {
    expect(normalizeMerchant("COPEC 12345 LAS CONDES")).toBe("COPEC LAS CONDES");
  });

  it("folds accents, uppercases and collapses whitespace", () => {
    expect(normalizeMerchant("  Farmàcia   Cruz Verde  ")).toBe("FARMACIA CRUZ VERDE");
  });

  it("is idempotent", () => {
    const once = normalizeMerchant("PAYU *UBER TRIP");
    expect(normalizeMerchant(once)).toBe(once);
  });

  it("handles empty input", () => {
    expect(normalizeMerchant("")).toBe("");
  });

  it("leaves ambiguous/noisy merchants intact enough to stay unknown", () => {
    // POCURO SA MINIMARKET PROD has no branch keyword → stays as-is (low-confidence later)
    expect(normalizeMerchant("POCURO SA MINIMARKET PROD")).toBe("POCURO SA MINIMARKET PROD");
  });
});

describe("categorize — real cartola corpus", () => {
  const cat = (descripcion: string, extra: Partial<Parameters<typeof categorize>[0]> = {}) =>
    categorize({ descripcion, tipo: "cargo", ...extra }).category;

  const cases: Array<[string, CategoryLabel]> = [
    ["PAGO COOPEUCH", "Vivienda"],
    ["ESMAX RED LIMITADA", "Combustible"],
    ["STA ISABEL PROV BILBAO", "Supermercado y almacén"],
    ["PAYU *UBER TRIP", "Transporte"],
    ["NETFLIX.COM", "Suscripciones y software"],
    ["OPENAI *CHATGPT SUBSCR", "Suscripciones y software"],
    ["CLAUDE.AI SUBSCRIPTION", "Suscripciones y software"],
    ["ANTHROPIC", "Suscripciones y software"],
    ["Google Workspace_codafina", "Suscripciones y software"],
    ["LIME*RIDE", "Transporte"],
    ["UBER", "Transporte"],
    ["LATAM.COM EUR LA", "Transporte"],
    ["MERPAGO*LATAM", "Transporte"],
    ["Prime Video", "Suscripciones y software"],
    ["Amazon", "Suscripciones y software"],
    ["amzn", "Suscripciones y software"],
    ["CAFE HAITI", "Restaurantes y delivery"],
    ["VIPs", "Restaurantes y delivery"],
    ["PLAYSTATION", "Entretenimiento"],
    ["PAGO EN LINEA T.G.R.", "Impuestos y servicios públicos"],
    ["COM.MANT.PROD.OPC.CTA.CTE.", "Comisiones bancarias"],
    ["PAC Seg. Fraude", "Seguros"],
    ["Transf a Condominio Mirador", "Vivienda"],
  ];

  it.each(cases)("%s → %s", (desc, expected) => {
    expect(cat(desc)).toBe(expected);
  });

  it("PAGO COOPEUCH is recurring", () => {
    expect(categorize({ descripcion: "PAGO COOPEUCH", tipo: "cargo" }).recurring).toBe(true);
  });

  it("internal traspaso to own card is excluded, not re-classified", () => {
    const r = categorize({ descripcion: "Traspaso Internet a T. Crédito", tipo: "cargo" });
    expect(r.category).toBe("Transferencia interna");
    expect(r.excluded).toBe(true);
  });

  it("honours the internalTransfer flag from the caller", () => {
    const r = categorize({
      descripcion: "Transf a Juan Perez",
      tipo: "cargo",
      internalTransfer: true,
    });
    expect(r.category).toBe("Transferencia interna");
    expect(r.excluded).toBe(true);
  });

  it("transfer to a third party matches the pattern, not the name", () => {
    const r = categorize({ descripcion: "Transf a Maria Gonzalez", tipo: "cargo" });
    expect(r.category).toBe("Transferencias");
    expect(r.subcategory).toBe("Transferencias enviadas");
    expect(r.ruleId).toBe("transfer.tercero");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("generic Santander transfer deposits are Transferencias recibidas, not Otro", () => {
    const descriptions = [
      "Transf. Rudolf Paul Schmidt Crnos",
      "077971019K Transf. STALLION SPA",
      "Transf. AGUILERA PINEIRO ANA",
      "Transf. JUAN SEBASTIAN CABELLO",
      "Transf. HAUG LIMITADA HAUG",
      "77.901.388-K Transf. HOME TELE",
    ];

    for (const descripcion of descriptions) {
      const r = categorize({ descripcion, tipo: "abono", monto: 100_000 });
      expect(r.category).toBe("Transferencias");
      expect(r.subcategory).toBe("Transferencias recibidas");
      expect(r.ruleId).toBe("transfer.tercero");
      expect(r.confidence).toBeGreaterThan(0.5);
    }
  });

  it("generic Santander transfer charges are Transferencias enviadas", () => {
    const r = categorize({ descripcion: "Transf. MARIA GONZALEZ", tipo: "cargo", monto: 50_000 });
    expect(r.category).toBe("Transferencias");
    expect(r.subcategory).toBe("Transferencias enviadas");
  });

  it("foreign merchants with clear hints avoid low-confidence Otro", () => {
    expect(categorize({ descripcion: "WOW Cinema Frankfurt am", tipo: "cargo" }).category).toBe(
      "Entretenimiento",
    );
    expect(categorize({ descripcion: "WOW Entertai Frankfurt am", tipo: "cargo" }).category).toBe(
      "Entretenimiento",
    );

    const zettle = categorize({ descripcion: "Zettle *Local Dealer Frankfurt am", tipo: "cargo" });
    expect(zettle.category).toBe("Retail y compras");
    expect(zettle.ruleId).toBe("cl.retail");

    const nyx = categorize({ descripcion: "NYX*ABServiciosSelectaE Madrid", tipo: "cargo" });
    expect(nyx.category).toBe("Retail y compras");
    expect(nyx.ruleId).toBe("cl.retail");
  });

  it("keeps Campus-Shop Frankfurt am as ambiguous Otro", () => {
    const r = categorize({ descripcion: "Campus-Shop Frankfurt am", tipo: "cargo" });
    expect(r.category).toBe("Otro");
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("frequent Santander rules map to informative legacy categories for Movimientos", () => {
    expect(categorize({ descripcion: "PAGO EN LINEA T.G.R.", tipo: "cargo" }).category).toBe(
      "Impuestos y servicios públicos",
    );
    expect(
      categorize({ descripcion: "PAGO EN LINEA T.G.R.", tipo: "cargo" }).confidence,
    ).toBeGreaterThan(0.5);
    expect(categorize({ descripcion: "COM.MANT.PROD.OPC.CTA.CTE.", tipo: "cargo" }).category).toBe(
      "Comisiones bancarias",
    );
    expect(categorize({ descripcion: "MERPAGO*LATAM", tipo: "cargo" }).category).toBe("Transporte");
    expect(categorize({ descripcion: "Amazon", tipo: "cargo" }).category).toBe(
      "Suscripciones y software",
    );
  });
});

describe("categorize — ambiguous stays low-confidence Otro (never force-fit)", () => {
  // "MINIMARKET" dejó de ser ambiguo (regla cl.supermercado desde 2026-07:
  // un minimarket ES almacén); se reemplaza por un caso genuinamente opaco.
  const ambiguous = ["S.FERRER LUIS PASTEUR", "POCURO SA PROD", "Compra Nacional NP"];
  it.each(ambiguous)("%s → Otro, low confidence", (desc) => {
    const r = categorize({ descripcion: desc, tipo: "cargo" });
    expect(r.category).toBe("Otro");
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe("categorize — traceability (NCG 502)", () => {
  it("every result carries a ruleId and the engine version", () => {
    for (const desc of ["NETFLIX.COM", "PAGO COOPEUCH", "Compra Nacional NP"]) {
      const r = categorize({ descripcion: desc, tipo: "cargo" });
      expect(r.ruleId).toBeTruthy();
      expect(r.version).toBe(CATEGORIZER_VERSION);
    }
  });

  it("uses categorizer version batch10.v4", () => {
    expect(CATEGORIZER_VERSION).toBe("batch10.v4");
  });

  it("trata una devolución de impuesto (abono) como ingreso, no como pago de impuesto", () => {
    const refund = categorize({ descripcion: "DEV IMPUESTO TESORERIA G", tipo: "abono" });
    expect(refund.category).toBe("Ingresos");
    // Un pago de impuesto (cargo) sigue siendo impuesto/servicio público.
    const payment = categorize({ descripcion: "PAGO EN LINEA T.G.R.", tipo: "cargo" });
    expect(payment.category).toBe("Impuestos y servicios públicos");
  });

  it("exposes essential + recurring tags", () => {
    const sup = categorize({ descripcion: "JUMBO MAIPU", tipo: "cargo" });
    expect(sup.essential).toBe(true);
    const sub = categorize({ descripcion: "SPOTIFY", tipo: "cargo" });
    expect(sub.essential).toBe(false);
    expect(sub.recurring).toBe(true);
  });
});
