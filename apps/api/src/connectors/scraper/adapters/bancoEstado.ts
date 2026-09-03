/**
 * Adapter de BancoEstado — PRIMER banco (mayor cobertura retail de Chile).
 *
 * ESQUELETO: la estructura del flujo está, pero los selectores/URLs reales se completan
 * iterando contra el sitio en vivo con una cuenta de PRUEBA. Cada método lanza `PendingAdapterError`
 * hasta que se implemente. Ver README.md de esta carpeta.
 */

import type { OBAccount, OBBalance, OBTransaction } from "../../openbanking/mockProvider.js";
import { PendingAdapterError } from "../types.js";
import type { BankAdapter, BankPage, MfaResolver, ScraperCredentials } from "../types.js";

export class BancoEstadoAdapter implements BankAdapter {
  readonly bankId = "bancoestado";
  readonly bankName = "BancoEstado";

  /**
   * Flujo real esperado (a completar):
   *  1. page.goto(LOGIN_URL)
   *  2. page.fill(RUT), page.fill(CLAVE), page.click(SUBMIT)
   *  3. detectar pantalla MFA (por url()/selector) → challenge → resolveMfa → ingresar respuesta
   *  4. waitForSelector(dashboard) para confirmar sesión
   */
  async login(
    _page: BankPage,
    _creds: ScraperCredentials,
    _resolveMfa: MfaResolver,
  ): Promise<void> {
    throw new PendingAdapterError("bancoestado", "login");
  }

  async listAccounts(_page: BankPage): Promise<OBAccount[]> {
    throw new PendingAdapterError("bancoestado", "listAccounts");
  }

  async getBalance(_page: BankPage, _providerAccountId: string): Promise<OBBalance> {
    throw new PendingAdapterError("bancoestado", "getBalance");
  }

  async listTransactions(
    _page: BankPage,
    _providerAccountId: string,
    _from: Date,
    _to: Date,
  ): Promise<OBTransaction[]> {
    throw new PendingAdapterError("bancoestado", "listTransactions");
  }
}
