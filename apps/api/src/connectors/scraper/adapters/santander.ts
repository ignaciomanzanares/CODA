/**
 * Adapter de Santander Chile ("Banco Online" / Santander Personas).
 *
 * ESQUELETO: la estructura del flujo está; los selectores/URLs reales se completan iterando
 * contra el sitio en vivo con una cuenta de PRUEBA (ver README.md de esta carpeta y el lab en
 * ~/Documents/Personal/WeGroup/coda-scraper-lab). Cada método lanza `PendingAdapterError` hasta
 * implementarse.
 *
 * Notas específicas de Santander CL (a confirmar en la primera corrida):
 *  - Login en https://www.santander.cl → "Banco en Línea": RUT + clave.
 *  - MFA: normalmente OTP/SuperClave (SMS o app SuperDigital) o push al dispositivo enrolado.
 *    Modelar como `kind: "otp" | "push"` según lo que muestre el sitio y resolver vía resolveMfa.
 *  - El sitio puede ser un SPA con XHR a un API interno: conviene inspeccionar las respuestas de
 *    red (movimientos/saldos suelen venir en JSON) en vez de raspar el DOM — más estable.
 */

import type { OBAccount, OBBalance, OBTransaction } from "../../openbanking/mockProvider.js";
import { PendingAdapterError } from "../types.js";
import type { BankAdapter, BankPage, MfaResolver, ScraperCredentials } from "../types.js";

export class SantanderAdapter implements BankAdapter {
  readonly bankId = "santander";
  readonly bankName = "Santander";

  /**
   * Flujo real esperado (a completar):
   *  1. page.goto(LOGIN_URL)
   *  2. page.fill(RUT), page.fill(CLAVE), page.click(SUBMIT)
   *  3. detectar pantalla MFA (por url()/selector) → challenge {kind, prompt} → resolveMfa →
   *     ingresar la respuesta y confirmar
   *  4. waitForSelector(dashboard) para confirmar sesión
   */
  async login(
    _page: BankPage,
    _creds: ScraperCredentials,
    _resolveMfa: MfaResolver,
  ): Promise<void> {
    throw new PendingAdapterError("santander", "login");
  }

  async listAccounts(_page: BankPage): Promise<OBAccount[]> {
    throw new PendingAdapterError("santander", "listAccounts");
  }

  async getBalance(_page: BankPage, _providerAccountId: string): Promise<OBBalance> {
    throw new PendingAdapterError("santander", "getBalance");
  }

  async listTransactions(
    _page: BankPage,
    _providerAccountId: string,
    _from: Date,
    _to: Date,
  ): Promise<OBTransaction[]> {
    throw new PendingAdapterError("santander", "listTransactions");
  }
}
