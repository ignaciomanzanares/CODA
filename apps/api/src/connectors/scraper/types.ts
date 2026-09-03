/**
 * Scraper bancario (Nivel 2) — contratos base.
 *
 * El scraper es UN `OBProvider` más: implementa el mismo contrato que MockProvider /
 * CartolaUploadProvider y escribe por `ingestOpenBankingForUser` a las tablas canónicas
 * `accounts` / `balances` / `transactions`. Aguas abajo (features, scoring, PFM) NO sabe
 * que los datos vinieron de un scraper.
 *
 * Modelo de credenciales — IN-SESSION, SIN PERSISTIR:
 * Los bancos chilenos exigen MFA en cada login, así que el refresco en background sin el
 * usuario presente es inviable. Por eso NUNCA guardamos la clave del banco: se recibe en
 * memoria, se usa durante el scrape y se descarta al cerrar el navegador. Esto elimina el
 * pasivo de custodiar credenciales bancarias.
 */

import type { OBAccount, OBBalance, OBTransaction } from "../openbanking/mockProvider.js";

/**
 * Un método del adapter que aún no se implementa contra el sitio real. Los esqueletos de banco
 * lanzan esto por método hasta que sus selectores/URLs se completan iterando en vivo con una
 * cuenta de prueba. Distinguible de un error de scrape genuino (login fallido, sesión caída).
 */
export class PendingAdapterError extends Error {
  constructor(bankId: string, step: string) {
    super(`${bankId}.${step}: pendiente — completar contra el sitio real`);
    this.name = "PendingAdapterError";
  }
}

/**
 * Credenciales del titular para el login bancario. EFÍMERAS: viven solo en memoria durante
 * el scrape, nunca se escriben a disco/DB ni se emiten en logs/telemetría.
 */
export interface ScraperCredentials {
  /** RUT del titular (con dígito verificador, p. ej. "12.345.678-9"). */
  rut: string;
  /** Clave de acceso del banco. Nunca se persiste ni se loguea. */
  password: string;
}

/** Desafío MFA que el banco presenta durante el login. */
export interface MfaChallenge {
  kind: "otp" | "coordinates" | "push" | "unknown";
  /** Texto legible para mostrarle al usuario (p. ej. "Ingresa el código enviado a tu app"). */
  prompt: string;
}

/**
 * Resuelve un desafío MFA: el caller (la UI, con el usuario presente) recibe el desafío y
 * devuelve la respuesta del usuario (OTP, coordenadas, confirmación de push).
 */
export type MfaResolver = (challenge: MfaChallenge) => Promise<string>;

/**
 * Abstracción mínima de una página de navegador. La satisface una `Page` de Playwright, pero
 * los adapters dependen de ESTO —no de Playwright— para ser testeables con un fake y no atar
 * el framework a un driver concreto.
 */
export interface BankPage {
  goto(url: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  /** Texto del primer elemento que matchea el selector (null si no existe). */
  textContent(selector: string): Promise<string | null>;
  /** Espera a que aparezca un selector (o timeout). */
  waitForSelector(selector: string, opts?: { timeoutMs?: number }): Promise<void>;
  /** URL actual (para detectar redirecciones post-login / pantallas MFA). */
  url(): string;
}

/**
 * Un adapter por banco: encapsula el login (incluida la MFA) y el parsing específico de ese
 * sitio. Agregar un banco = implementar esta interfaz; el resto del pipeline no cambia.
 */
export interface BankAdapter {
  /** Identificador estable, minúsculas: 'bancoestado' | 'santander' | 'bancochile' | … */
  readonly bankId: string;
  readonly bankName: string;

  /** Autentica la sesión en `page`. Resuelve la MFA vía `resolveMfa`. Lanza si el login falla. */
  login(page: BankPage, creds: ScraperCredentials, resolveMfa: MfaResolver): Promise<void>;

  /** Lista las cuentas del titular una vez autenticado. */
  listAccounts(page: BankPage): Promise<OBAccount[]>;

  /** Saldo actual de una cuenta. */
  getBalance(page: BankPage, providerAccountId: string): Promise<OBBalance>;

  /** Movimientos de una cuenta en el rango [from, to]. */
  listTransactions(
    page: BankPage,
    providerAccountId: string,
    from: Date,
    to: Date,
  ): Promise<OBTransaction[]>;
}
