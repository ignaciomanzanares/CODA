import { describe, it, expect, afterEach } from "vitest";
import { buildContextPrompt, getProviderChain } from "../aiService.js";
import type { FinancialContext } from "../aiService.js";

const baseContext: FinancialContext = {
  monthlyIncome: 1_450_000,
  recentTransactions: [
    {
      description: "TRANSFERENCIA A JUAN PEREZ",
      amount: -85_000,
      category: "transferencia_enviada",
      date: "2026-01-10",
    },
    { description: "FARMACIA CRUZ VERDE LASTARRIA", amount: -23_500, category: "salud" },
  ],
  debts: [{ type: "Tarjeta de crédito", balance: -640_000, rate: 35 }],
} as FinancialContext;

describe("AI payload anonymization (#6)", () => {
  it("por defecto: rangos en vez de montos exactos y SIN glosas de transacciones", () => {
    const prompt = buildContextPrompt(baseContext);

    // Monto exacto del ingreso NO aparece; sí su rango.
    expect(prompt).not.toContain("1.450.000");
    expect(prompt).toContain("$1.000.000–$2.000.000");

    // Las glosas (descripción de transacción) NO se filtran.
    expect(prompt).not.toContain("JUAN PEREZ");
    expect(prompt).not.toContain("FARMACIA CRUZ VERDE");
    // Pero sí la categoría (no es PII directa).
    expect(prompt).toContain("salud");
  });

  it("modo explícito sin anonimizar: vuelve a montos exactos y glosas (para usos internos)", () => {
    const prompt = buildContextPrompt(baseContext, { anonymize: false });
    expect(prompt).toContain("1.450.000");
    expect(prompt).toContain("JUAN PEREZ");
  });
});

describe("AI provider whitelist (#6)", () => {
  const saved = {
    AI_AUTHORIZED_PROVIDERS: process.env.AI_AUTHORIZED_PROVIDERS,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("respeta AI_AUTHORIZED_PROVIDERS: excluye proveedores no autorizados aunque tengan key", () => {
    process.env.GROQ_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.OPENAI_API_KEY = "k";
    process.env.AI_AUTHORIZED_PROVIDERS = "anthropic";

    const chain = getProviderChain();
    expect(chain).toContain("anthropic");
    expect(chain).not.toContain("groq");
    expect(chain).not.toContain("openai");
  });

  it("sin la variable, no restringe (solo filtra por API key disponible)", () => {
    delete process.env.AI_AUTHORIZED_PROVIDERS;
    process.env.GROQ_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "k";

    const chain = getProviderChain();
    expect(chain).toContain("groq");
    expect(chain).toContain("anthropic");
  });
});
