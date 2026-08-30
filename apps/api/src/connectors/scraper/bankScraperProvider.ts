/**
 * `OBProvider` respaldado por un scraper.
 *
 * Envuelve una sesión de navegador YA autenticada (`BankPage`) + el `BankAdapter` del banco,
 * y expone el contrato `OBProvider` que consume `ingestOpenBankingForUser`. El desacople es el
 * punto: nada aguas abajo sabe que los datos vinieron de un scraper.
 */

import type {
  OBProvider,
  OBAccount,
  OBBalance,
  OBTransaction,
} from "../openbanking/mockProvider.js";
import type { BankAdapter, BankPage } from "./types.js";

export class BankScraperProvider implements OBProvider {
  constructor(
    private readonly page: BankPage,
    private readonly adapter: BankAdapter,
  ) {}

  listAccounts(_userId: string): Promise<OBAccount[]> {
    return this.adapter.listAccounts(this.page);
  }

  getBalance(providerAccountId: string): Promise<OBBalance> {
    return this.adapter.getBalance(this.page, providerAccountId);
  }

  listTransactions(providerAccountId: string, from: Date, to: Date): Promise<OBTransaction[]> {
    return this.adapter.listTransactions(this.page, providerAccountId, from, to);
  }
}
