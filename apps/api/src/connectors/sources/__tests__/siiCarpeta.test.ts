import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearConnectors, getConnector, listConnectors } from "../../registry.js";
import {
  InvalidSecretShapeError,
  PendingFetchError,
  SII_CARPETA_CONNECTOR_ID,
  asCarpetaSecret,
  fetchCarpetaPdf,
  runSiiCarpeta,
  siiCarpetaConnector,
} from "../siiCarpeta.js";
import { registerBuiltinConnectors } from "../index.js";

// La bóveda se prueba aparte (connectorSecretVault.test.ts): acá sólo importa qué hace el
// conector con lo que ella devuelve o con lo que lanza.
const { getSecretSpy } = vi.hoisted(() => ({ getSecretSpy: vi.fn() }));
vi.mock("../../../services/secrets/connectorSecretVault.js", () => ({
  getSecret: getSecretSpy,
}));

const CTX = { userId: "u1", accessId: "access-1", consentGrantId: 9 };

beforeEach(() => {
  getSecretSpy.mockReset();
});

describe("registro de conectores de fuentes", () => {
  it("registra la carpeta del SII y es idempotente", () => {
    clearConnectors();
    registerBuiltinConnectors();
    registerBuiltinConnectors(); // no lanza: la API y el worker in-process lo llaman los dos

    expect(listConnectors()).toHaveLength(1);
    expect(getConnector(SII_CARPETA_CONNECTOR_ID)).toMatchObject({
      resourceType: "sii_tax_data",
    });
  });
});

describe("asCarpetaSecret", () => {
  it("acepta código y clave, recortando espacios", () => {
    expect(asCarpetaSecret({ codigo: " 30635361 ", clave: " abc123 " })).toEqual({
      codigo: "30635361",
      clave: "abc123",
    });
  });

  it("rechaza un secreto incompleto", () => {
    expect(() => asCarpetaSecret({ codigo: "30635361" })).toThrow(InvalidSecretShapeError);
    expect(() => asCarpetaSecret({ clave: "abc" })).toThrow(InvalidSecretShapeError);
    expect(() => asCarpetaSecret({ codigo: "  ", clave: "abc" })).toThrow(InvalidSecretShapeError);
  });
});

describe("runSiiCarpeta", () => {
  it("sin acceso guardado propaga el error de la bóveda y no intenta el fetch", async () => {
    const missing = Object.assign(new Error("no hay secreto"), { code: "secret_missing" });
    getSecretSpy.mockRejectedValue(missing);

    await expect(runSiiCarpeta(CTX)).rejects.toBe(missing);
    expect(getSecretSpy).toHaveBeenCalledWith("u1", SII_CARPETA_CONNECTOR_ID);
  });

  it("con acceso guardado llega hasta el fetch, que está pendiente (no inventa datos)", async () => {
    getSecretSpy.mockResolvedValue({ codigo: "30635361", clave: "abc123" });
    await expect(runSiiCarpeta(CTX)).rejects.toBeInstanceOf(PendingFetchError);
  });

  it("el fetch pendiente lanza y no devuelve un PDF vacío", async () => {
    await expect(fetchCarpetaPdf({ codigo: "x", clave: "y" })).rejects.toBeInstanceOf(
      PendingFetchError,
    );
  });
});

describe("qué se reintenta", () => {
  it("no reintenta lo que sólo arregla el usuario, sí los fallos de la fuente", () => {
    const retry = (code?: string) =>
      siiCarpetaConnector.isRetryable!(
        code ? Object.assign(new Error("x"), { code }) : new Error("x"),
      );

    for (const code of [
      "pending_fetch",
      "invalid_secret_shape",
      "secret_missing",
      "secret_expired",
    ]) {
      expect(retry(code)).toBe(false);
    }
    expect(retry("ETIMEDOUT")).toBe(true);
    expect(retry()).toBe(true);
  });
});
