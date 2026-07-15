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
