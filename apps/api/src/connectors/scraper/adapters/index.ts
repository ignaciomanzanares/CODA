/**
 * Catálogo de bancos que el Nivel 2 puede vincular, con su estado REAL.
 *
 * Existía el pipeline completo del scraper y dos adapters, pero nada en la app sabía qué
 * bancos hay ni cuáles funcionan: `scrapeAndIngest` no tenía un solo llamador. Sin este
 * catálogo, la única forma de enterarse de que un banco todavía no está listo era intentar
 * vincularlo y recibir un error técnico (`PendingAdapterError`) a mitad del flujo, con la
 * clave del titular ya escrita.
 */

import type { BankAdapter } from "../types.js";
import { BancoEstadoAdapter } from "./bancoEstado.js";
import { SantanderAdapter } from "./santander.js";

export type EstadoBanco = "disponible" | "pendiente";

export interface BancoSoportado {
  bankId: string;
  bankName: string;
  estado: EstadoBanco;
  /** Qué decirle al titular. Vacío cuando el banco está disponible. */
  mensaje: string;
}

/** Una instancia nueva por vinculación: el adapter no comparte estado entre titulares. */
const ADAPTERS: Record<string, () => BankAdapter> = {
  bancoestado: () => new BancoEstadoAdapter(),
  santander: () => new SantanderAdapter(),
};

/**
 * Bancos cuyo adapter ya está completo contra el sitio real.
 *
 * Es una lista EXPLÍCITA, no una deducción. Averiguarlo ejecutando los métodos exigiría abrir
 * un navegador contra el banco, y el modo de falla de adivinar es el peor posible: un adapter
 * a medio implementar pasando por "disponible" le pediría la clave a alguien para después no
 * poder hacer nada con ella. Se agrega un banco acá recién cuando su primera corrida real
 * funcionó de punta a punta.
 */
const COMPLETOS = new Set<string>();

const MOTIVO_PENDIENTE: Record<string, string> = {
  bancoestado:
    "Todavía estamos terminando la conexión con BancoEstado. Mientras tanto puedes subir tu cartola en PDF.",
  santander:
    "Todavía no tenemos la conexión con Santander. Mientras tanto puedes subir tu cartola en PDF.",
};

const MENSAJE_GENERICO =
  "Todavía estamos terminando esta conexión. Mientras tanto puedes subir tu cartola en PDF.";

export function listarBancosSoportados(): BancoSoportado[] {
  return Object.entries(ADAPTERS).map(([bankId, crear]) => {
    const disponible = COMPLETOS.has(bankId);
    return {
      bankId,
      bankName: crear().bankName,
      estado: disponible ? "disponible" : "pendiente",
      mensaje: disponible ? "" : (MOTIVO_PENDIENTE[bankId] ?? MENSAJE_GENERICO),
    };
  });
}

/** El adapter de un banco, o undefined si no está en el catálogo. */
export function crearAdapter(bankId: string): BankAdapter | undefined {
  return ADAPTERS[bankId]?.();
}

/** ¿Se puede intentar una vinculación con este banco hoy? */
export function bancoDisponible(bankId: string): boolean {
  return bankId in ADAPTERS && COMPLETOS.has(bankId);
}
