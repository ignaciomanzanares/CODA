/**
 * El catálogo tiene que decir la VERDAD sobre cada banco: marcar "disponible" uno cuyo adapter
 * sigue siendo un esqueleto haría que la app le pida la clave a alguien para después no poder
 * hacer nada con ella.
 */
import { describe, it, expect } from "vitest";
import { listarBancosSoportados, crearAdapter, bancoDisponible } from "../adapters/index";
import { PendingAdapterError, type BankPage } from "../types";

const pageInerte = (): BankPage => ({
  goto: async () => {},
  fill: async () => {},
  click: async () => {},
  textContent: async () => null,
  waitForSelector: async () => {},
  url: () => "about:blank",
});

describe("catálogo de bancos del scraper", () => {
  it("BancoEstado está en el catálogo: es el banco elegido", () => {
    const ids = listarBancosSoportados().map((b) => b.bankId);
    expect(ids).toContain("bancoestado");
  });

  it("todo banco marcado 'pendiente' trae un mensaje para el titular, y ninguno disponible lo trae", () => {
    for (const b of listarBancosSoportados()) {
      if (b.estado === "pendiente") {
        expect(b.mensaje.length).toBeGreaterThan(0);
        expect(b.mensaje).toMatch(/cartola/i); // siempre ofrece la alternativa que SÍ funciona
      } else {
        expect(b.mensaje).toBe("");
      }
    }
  });

  it("ningún banco se declara disponible mientras su adapter sea un esqueleto", async () => {
    for (const b of listarBancosSoportados()) {
      if (b.estado !== "disponible") continue;
      const adapter = crearAdapter(b.bankId)!;
      // Un adapter completo NO lanza PendingAdapterError al listar cuentas.
      await expect(adapter.listAccounts(pageInerte())).rejects.not.toBeInstanceOf(
        PendingAdapterError,
      );
    }
  });

  it("un banco fuera del catálogo no existe ni está disponible", () => {
    expect(crearAdapter("banco-inventado")).toBeUndefined();
    expect(bancoDisponible("banco-inventado")).toBe(false);
  });

  it("cada instancia del adapter es nueva (no se comparte estado entre titulares)", () => {
    expect(crearAdapter("bancoestado")).not.toBe(crearAdapter("bancoestado"));
  });
});
