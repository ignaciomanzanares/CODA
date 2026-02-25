import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type CurrencyCode = "CLP" | "USD";

/** Tasa USD → CLP en tiempo real (se actualiza desde CurrencyContext). Fallback 1000. */
let currentRateUsdToClp = Number(import.meta.env.VITE_USD_TO_CLP) || 1000;

/** Actualiza la tasa USD/CLP (llamado desde CurrencyProvider al obtener la cotización). */
export function setExchangeRate(rate: number): void {
  if (rate > 0) currentRateUsdToClp = rate;
}

/** Devuelve la tasa actual (para mostrar en UI si se quiere). */
export function getExchangeRate(): number {
  return currentRateUsdToClp;
}

/** Convierte USD → CLP. */
export function usdToClp(amountUsd: number): number {
  return Math.round(amountUsd * currentRateUsdToClp);
}

/** Convierte CLP → USD. */
export function clpToUsd(amountClp: number): number {
  return amountClp / currentRateUsdToClp;
}

/**
 * Los montos se guardan siempre en CLP en el backend.
 * Convierte lo que el usuario escribe (en la moneda elegida) a CLP para enviar.
 */
export function inputAmountToStoredClp(amount: number, displayCurrency: CurrencyCode): number {
  if (displayCurrency === "USD") return Math.round(usdToClp(amount));
  return Math.round(amount);
}

/**
 * Convierte un monto almacenado en CLP al valor a mostrar en inputs (moneda elegida).
 */
export function storedClpToDisplayAmount(storedClp: number, displayCurrency: CurrencyCode): number {
  if (displayCurrency === "USD") return Math.round(clpToUsd(storedClp) * 100) / 100;
  return storedClp;
}

export type SourceCurrency = "USD" | "CLP";

/**
 * Convierte amount a la moneda de visualización.
 * - sourceCurrency "USD" (default): datos en dólares (dashboard personal, etc.).
 * - sourceCurrency "CLP": datos ya en pesos (ej. CODA Empresas).
 */
function toDisplayAmount(amount: number, displayCurrency: CurrencyCode, sourceCurrency: SourceCurrency): number {
  if (sourceCurrency === displayCurrency) return amount;
  if (displayCurrency === "CLP" && sourceCurrency === "USD") return usdToClp(amount);
  if (displayCurrency === "USD" && sourceCurrency === "CLP") return clpToUsd(amount);
  return amount;
}

export interface FormatCurrencyOptions {
  /** Moneda en la que viene el amount. Por defecto "USD" (dashboard, dividir cuenta, etc.). Usar "CLP" en Empresas. */
  sourceCurrency?: SourceCurrency;
}

/**
 * Formatea un monto con conversión real.
 * Si amount está en USD y visualizas en CLP, se convierte (ej. 100 USD → $100.000).
 * Si amount está en CLP (sourceCurrency: "CLP"), no se convierte al mostrar en CLP.
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = "CLP",
  options?: FormatCurrencyOptions
): string {
  const source = options?.sourceCurrency ?? "USD";
  const value = toDisplayAmount(amount, currency, source);
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formato corto para gráficos. Misma conversión que formatCurrency.
 */
export function formatCurrencyShort(
  amount: number,
  currency: CurrencyCode = "CLP",
  options?: FormatCurrencyOptions
): string {
  const source = options?.sourceCurrency ?? "USD";
  const value = toDisplayAmount(amount, currency, source);
  const abs = Math.abs(value);
  const sym = "$";
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}${sym}${(abs / 1_000).toFixed(0)}K`;
  return formatCurrency(amount, currency, options);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return 'just now'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours}h ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays}d ago`
  }
  
  return formatDate(d)
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}
