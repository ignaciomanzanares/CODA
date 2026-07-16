/**
 * Unit tests for the economic-indicators service (UF / USD).
 *
 * No network and no DB: `fetch` is stubbed and the db module is mocked, so we
 * exercise cache-first behaviour, parsing, and the graceful null fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mutable state between the db mock and the tests (hoisted above vi.mock).
const h = vi.hoisted(() => ({
  cacheRows: [] as Array<{ valueClp: number }>,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../src/db/index.js", () => {
  const where = async () => h.cacheRows.slice();
  const from = () => ({ where });
  const select = () => ({ from });
  const values = (v: Record<string, unknown>) => {
    h.inserted.push(v);
    return { onConflictDoNothing: async () => undefined };
  };
  const insert = () => ({ values });
  return {
    db: { select, insert },
    indicatorValues: { id: "id", kind: "kind", date: "date", valueClp: "value_clp" },
    eq: () => true,
  };
});

import {
  getUf,
  getUsd,
  parseMindicadorValue,
  pickSerieValueAtOrBefore,
  toIsoDate,
  toMindicadorDate,
} from "../../src/services/indicators.js";

const DATE = new Date(2026, 2, 31); // 31-03-2026 (mes 0-indexado)

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  h.cacheRows = [];
  h.inserted = [];
  vi.unstubAllGlobals();
});

describe("date formatting", () => {
  it("toIsoDate → yyyy-mm-dd", () => {
    expect(toIsoDate(DATE)).toBe("2026-03-31");
  });
  it("toMindicadorDate → dd-mm-yyyy", () => {
    expect(toMindicadorDate(DATE)).toBe("31-03-2026");
  });
});

describe("parseMindicadorValue", () => {
  it("extracts serie[0].valor", () => {
    expect(parseMindicadorValue({ serie: [{ fecha: "x", valor: 950.5 }] })).toBe(950.5);
  });
  it("returns null for empty/invalid payloads", () => {
    expect(parseMindicadorValue({ serie: [] })).toBeNull();
    expect(parseMindicadorValue({})).toBeNull();
    expect(parseMindicadorValue(null)).toBeNull();
    expect(parseMindicadorValue({ serie: [{ valor: 0 }] })).toBeNull();
  });
});

describe("getUf / getUsd", () => {
  it("cache hit: returns cached value without fetching", async () => {
    h.cacheRows = [{ valueClp: 39123.45 }];
    const fetchFn = mockFetchOnce(() => {
      throw new Error("should not fetch on cache hit");
    });
    await expect(getUf(DATE)).resolves.toBe(39123.45);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("cache miss: fetches, returns value, and caches it", async () => {
    const fetchFn = mockFetchOnce(
      () => new Response(JSON.stringify({ serie: [{ valor: 943.2 }] }), { status: 200 }),
    );
    await expect(getUsd(DATE)).resolves.toBe(943.2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://mindicador.cl/api/dolar/31-03-2026");
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0]).toMatchObject({ kind: "usd", date: "2026-03-31", valueClp: 943.2 });
  });

  it("uses the uf endpoint for getUf", async () => {
    const fetchFn = mockFetchOnce(
      () => new Response(JSON.stringify({ serie: [{ valor: 39000 }] }), { status: 200 }),
    );
    await expect(getUf(DATE)).resolves.toBe(39000);
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://mindicador.cl/api/uf/31-03-2026");
  });

  it("graceful fallback: non-ok response → null (no throw, no cache write)", async () => {
    mockFetchOnce(() => new Response("nope", { status: 404 }));
    await expect(getUsd(DATE)).resolves.toBeNull();
    expect(h.inserted).toHaveLength(0);
  });

  it("graceful fallback: network error → null (never blocks ingestion)", async () => {
    mockFetchOnce(() => {
      throw new Error("ENOTFOUND mindicador.cl");
    });
    await expect(getUf(DATE)).resolves.toBeNull();
  });

  it("graceful fallback: date unavailable (empty serie) → null", async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ serie: [] }), { status: 200 }));
    await expect(getUsd(DATE)).resolves.toBeNull();
  });
});

describe("pickSerieValueAtOrBefore — día hábil más cercano anterior", () => {
  const serie = {
    serie: [
      { fecha: "2026-04-02T04:00:00.000Z", valor: 950 },
      { fecha: "2026-03-30T04:00:00.000Z", valor: 940 },
      { fecha: "2026-03-27T04:00:00.000Z", valor: 930 },
    ],
  };
  it("fecha exacta en la serie → ese valor", () => {
    expect(pickSerieValueAtOrBefore(serie, "2026-03-30")).toBe(940);
  });
  it("fin de semana → el hábil anterior (salta valores posteriores)", () => {
    expect(pickSerieValueAtOrBefore(serie, "2026-03-28")).toBe(930);
  });
  it("fecha anterior a toda la serie → null (no usar tasas muy posteriores)", () => {
    expect(pickSerieValueAtOrBefore(serie, "2025-01-01")).toBeNull();
  });
});

describe("fallbacks de getUsd (feriados / mindicador caído)", () => {
  it("fecha sin valor (feriado) → retrocede al día hábil anterior y lo cachea", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/31-03-2026")) return new Response(JSON.stringify({ serie: [] }));
      if (u.endsWith("/30-03-2026"))
        return new Response(JSON.stringify({ serie: [{ fecha: "x", valor: 941.7 }] }));
      return new Response(JSON.stringify({ serie: [] }));
    });
    vi.stubGlobal("fetch", fetchFn);
    await expect(getUsd(DATE)).resolves.toBe(941.7);
    expect(h.inserted[0]).toMatchObject({ kind: "usd", date: "2026-03-30", valueClp: 941.7 });
  });

  it("mindicador por fecha caído pero serie viva → valor de la serie", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === "https://mindicador.cl/api/dolar")
        return new Response(
          JSON.stringify({ serie: [{ fecha: "2026-03-31T04:00:00.000Z", valor: 947.3 }] }),
        );
      return new Response("down", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchFn);
    await expect(getUsd(DATE)).resolves.toBe(947.3);
  });

  it("mindicador caído del todo + fecha reciente → tasa actual de er-api (sin cachear)", async () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith("https://open.er-api.com"))
        return new Response(JSON.stringify({ rates: { CLP: 952.1 } }));
      return new Response("down", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchFn);
    await expect(getUsd(recent)).resolves.toBe(952.1);
    expect(h.inserted).toHaveLength(0); // aproximada: no se persiste
  });

  it("mindicador caído + fecha antigua (>45 días) → null (no distorsionar cartolas viejas)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith("https://open.er-api.com"))
        return new Response(JSON.stringify({ rates: { CLP: 952.1 } }));
      return new Response("down", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchFn);
    await expect(getUsd(DATE)).resolves.toBeNull();
    expect(fetchFn.mock.calls.every(([u]) => !String(u).startsWith("https://open.er-api"))).toBe(
      true,
    );
  });
});
