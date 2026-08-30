import { describe, it, expect, vi } from "vitest";
import { BankScraperProvider } from "../bankScraperProvider";
import { scrapeAndIngest, type BrowserDriver } from "../scrapeAndIngest";
import type { BankAdapter, BankPage, MfaResolver, ScraperCredentials } from "../types";
import type { OBAccount, OBBalance, OBTransaction } from "../../openbanking/mockProvider";

/** BankPage inerte para tests (los adapters fake no la usan). */
function fakePage(): BankPage {
  return {
    goto: async () => {},
    fill: async () => {},
    click: async () => {},
    textContent: async () => null,
    waitForSelector: async () => {},
    url: () => "about:blank",
  };
}

/** Adapter fake con datos canned; registra que recibió la page correcta. */
function fakeAdapter(overrides: Partial<BankAdapter> = {}): BankAdapter {
  return {
    bankId: "fakebank",
    bankName: "Fake Bank",
    login: async () => {},
    listAccounts: async (): Promise<OBAccount[]> => [
      { providerAccountId: "acc-1", name: "Cuenta" },
    ],
    getBalance: async (): Promise<OBBalance> => ({ current: 1000, currency: "CLP" }),
    listTransactions: async (): Promise<OBTransaction[]> => [
      { externalId: "t1", postedAt: new Date(), amount: -500, description: "Compra" },
    ],
    ...overrides,
  };
}

describe("BankScraperProvider", () => {
  it("delega listAccounts/getBalance/listTransactions al adapter con la page inyectada", async () => {
    const page = fakePage();
    const adapter = fakeAdapter();
    const provider = new BankScraperProvider(page, adapter);

    expect(await provider.listAccounts("u1")).toEqual([
      { providerAccountId: "acc-1", name: "Cuenta" },
    ]);
    expect((await provider.getBalance("acc-1")).current).toBe(1000);
    const txs = await provider.listTransactions("acc-1", new Date(0), new Date());
    expect(txs[0].externalId).toBe("t1");
  });
});

describe("scrapeAndIngest — garantía de seguridad", () => {
  it("cierra el navegador SIEMPRE, incluso si el login falla (no deja sesión colgada)", async () => {
    const close = vi.fn(async () => {});
    const driver: BrowserDriver = { newPage: async () => fakePage(), close };
    const adapter = fakeAdapter({
      login: async () => {
        throw new Error("credenciales inválidas");
      },
    });
    const creds: ScraperCredentials = { rut: "1-9", password: "x" };
    const resolveMfa: MfaResolver = async () => "000000";

    await expect(
      scrapeAndIngest({ userId: "u1", adapter, creds, resolveMfa, driver }),
    ).rejects.toThrow("credenciales inválidas");
    // El finally cerró el navegador aunque el login lanzó.
    expect(close).toHaveBeenCalledTimes(1);
  });
});
