import { describe, it, expect, afterEach } from "vitest";
import { withCsrfHeader } from "../csrf";

/** #16: primer test del frontend (lógica pura, sin RTL). */
afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe("withCsrfHeader (#16)", () => {
  it("no toca los headers en métodos no mutantes (GET)", () => {
    expect(withCsrfHeader("GET", { Accept: "json" })).toEqual({ Accept: "json" });
  });

  it("agrega X-CSRF-Token en POST cuando existe la cookie coda_csrf", () => {
    (globalThis as { document?: { cookie: string } }).document = {
      cookie: "coda_csrf=abc123; other=x",
    };
    expect(withCsrfHeader("POST", {})).toEqual({ "X-CSRF-Token": "abc123" });
  });

  it("no agrega header si no hay cookie CSRF", () => {
    (globalThis as { document?: { cookie: string } }).document = { cookie: "other=x" };
    expect(withCsrfHeader("POST", {})).toEqual({});
  });
});
