/**
 * Orquestador del scrape: abre un navegador, autentica con el adapter del banco, envuelve la
 * sesión como `OBProvider` y ingiere a las tablas canónicas. Cierra SIEMPRE el navegador al
 * terminar (finally) → la sesión y las credenciales en memoria se descartan pase lo que pase.
 */

import { ingestOpenBankingForUser } from "../../jobs/ingest.js";
import { BankScraperProvider } from "./bankScraperProvider.js";
import type { BankAdapter, BankPage, MfaResolver, ScraperCredentials } from "./types.js";

/**
 * Driver de navegador. Lo implementa el driver concreto (Playwright) fuera de este módulo, para
 * que el orquestador y los adapters no dependan del motor de automatización.
 */
export interface BrowserDriver {
  /** Abre una página nueva lista para navegar. */
  newPage(): Promise<BankPage>;
  /** Cierra el navegador y libera la sesión. */
  close(): Promise<void>;
}

export interface ScrapeOptions {
  userId: string;
  adapter: BankAdapter;
  /** Credenciales efímeras del titular (no se persisten). */
  creds: ScraperCredentials;
  /** Resuelve la MFA con el usuario presente. */
  resolveMfa: MfaResolver;
  /** Driver de navegador (Playwright en prod/dev; un fake en tests). */
  driver: BrowserDriver;
}

export interface ScrapeResult {
  bankId: string;
  ok: boolean;
}

/**
 * Ejecuta el scrape completo para un banco y usuario. Never-persist de credenciales garantizado
 * por el `finally` que cierra el navegador.
 */
export async function scrapeAndIngest(opts: ScrapeOptions): Promise<ScrapeResult> {
  const { userId, adapter, creds, resolveMfa, driver } = opts;
  const page = await driver.newPage();
  try {
    await adapter.login(page, creds, resolveMfa);
    const provider = new BankScraperProvider(page, adapter);
    await ingestOpenBankingForUser(userId, provider);
    return { bankId: adapter.bankId, ok: true };
  } finally {
    // Cierra el navegador SIEMPRE: descarta la sesión autenticada y las credenciales en memoria.
    await driver.close();
  }
}
