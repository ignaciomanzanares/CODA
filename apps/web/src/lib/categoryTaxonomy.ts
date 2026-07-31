// ─── Category Taxonomy ──────────────────────────────────────────────────────
// Maps parser categories into the 5 dashboard groups.
//
// Source of truth for valid categories: VALID_CATEGORIES in routes.ts line ~1403:
//   vivienda, alimentacion, transporte, seguros, servicios_basicos,
//   salud_bienestar, educacion, cuidado_personal,
//   diversion, hobbies, suscripciones,
//   deudas, inversiones, ahorros,
//   regalos, reparaciones, imprevistos,
//   telecomunicaciones, transferencia_enviada, transferencia_recibida,
//   comercio, entretenimiento, salud, ingreso_principal, servicios, otro

import { Wallet, Home, User, Gamepad2, Landmark, ArrowLeftRight, PiggyBank } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CategoryGroupKey } from "@/types/dashboard";

export interface CategoryTaxonomyEntry {
  key: CategoryGroupKey;
  label: string;
  icon: LucideIcon;
  color: "green" | "blue" | "purple" | "orange" | "red" | "slate" | "indigo";
  chartColor: string;
  /** Raw parser categories that map to this group */
  parserCategories: string[];
  /** Human-readable subcategory labels */
  subcategoryLabels: Record<string, string>;
}

export const CATEGORY_TAXONOMY: CategoryTaxonomyEntry[] = [
  {
    key: "ingresos",
    label: "Ingresos",
    icon: Wallet,
    color: "green",
    chartColor: "#10b981",
    parserCategories: [
      "ingreso_principal",
      "honorarios",
      "transferencia_recibida",
      "devoluciones",
      "rentas",
      "otros_ingresos",
    ],
    subcategoryLabels: {
      ingreso_principal: "Sueldo / Ingreso principal",
      honorarios: "Honorarios",
      transferencia_recibida: "Transferencias recibidas",
      devoluciones: "Devoluciones y reintegros",
      rentas: "Rentas e inversiones",
      otros_ingresos: "Otros ingresos",
    },
  },
  {
    key: "esenciales",
    label: "Gastos Esenciales",
    icon: Home,
    color: "blue",
    chartColor: "#3b82f6",
    parserCategories: [
      "vivienda",
      "alimentacion",
      "transporte",
      "seguros",
      "servicios_basicos",
      "servicios",
      "telecomunicaciones",
      "educacion",
    ],
    subcategoryLabels: {
      vivienda: "Vivienda",
      alimentacion: "Alimentación",
      transporte: "Transporte",
      seguros: "Otros pagos recurrentes",
      servicios_basicos: "Servicios básicos",
      servicios: "Servicios",
      telecomunicaciones: "Telecomunicaciones",
      educacion: "Educación",
    },
  },
  {
    key: "personales",
    label: "Gastos Personales",
    icon: User,
    color: "purple",
    chartColor: "#8b5cf6",
    parserCategories: [
      "salud",
      "salud_bienestar",
      "cuidado_personal",
      "comercio",
      "regalos",
      "reparaciones",
      "imprevistos",
      "otro",
    ],
    subcategoryLabels: {
      salud: "Salud",
      salud_bienestar: "Salud y bienestar",
      cuidado_personal: "Cuidado personal",
      comercio: "Compras y comercio",
      regalos: "Regalos",
      reparaciones: "Reparaciones",
      imprevistos: "Imprevistos",
      otro: "Otros",
    },
  },
  {
    key: "ocio",
    label: "Ocio y Entretenimiento",
    icon: Gamepad2,
    color: "orange",
    chartColor: "#f59e0b",
    parserCategories: ["restaurantes", "entretenimiento", "diversion", "hobbies", "suscripciones"],
    subcategoryLabels: {
      restaurantes: "Restaurantes y comida fuera",
      entretenimiento: "Entretenimiento",
      diversion: "Diversión",
      hobbies: "Hobbies",
      suscripciones: "Suscripciones",
    },
  },
  {
    // Solo deuda real (pagos de crédito, comisiones): NO transferencias ni ahorro.
    // Antes esta categoría absorbía transferencia_enviada y ahorro/inversión, lo que
    // inflaba "Gastos Financieros" al 90% de los egresos con transferencias a terceros.
    key: "financieros",
    label: "Gastos Financieros",
    icon: Landmark,
    color: "red",
    chartColor: "#ef4444",
    parserCategories: ["deudas"],
    subcategoryLabels: {
      deudas: "Pago de deudas",
    },
  },
  {
    // Transferencias enviadas a terceros: mover plata NO es gastarla. Grupo propio,
    // neutro, para no confundirlo con consumo ni con carga financiera.
    key: "transferencias",
    label: "Transferencias",
    icon: ArrowLeftRight,
    color: "slate",
    chartColor: "#64748b",
    parserCategories: ["transferencia_enviada"],
    subcategoryLabels: {
      transferencia_enviada: "Transferencias enviadas",
    },
  },
  {
    // Aportes a ahorro/inversión: construyen patrimonio, no son un gasto.
    key: "ahorro",
    label: "Ahorro e inversión",
    icon: PiggyBank,
    color: "indigo",
    chartColor: "#6366f1",
    parserCategories: ["ahorros", "inversiones"],
    subcategoryLabels: {
      ahorros: "Aportes a ahorros",
      inversiones: "Aportes a inversiones",
    },
  },
];

/**
 * Selector de categoría de Movimientos, SEGÚN EL TIPO del movimiento.
 * El tipo (ingreso/egreso) ya da la dirección, así que la categoría aporta el
 * PROPÓSITO:
 *   • Egresos  → modelo 50/30/20: Necesidades / Deseos / Ahorro (+ Transferencia).
 *   • Ingresos → fuentes de ingreso.
 * `canonical` = categoría que se guarda al elegir esa opción; `categories` = las
 * categorías finas que se muestran con ese label (para derivar el label de una
 * fila ya categorizada). Así el dashboard conserva el detalle fino.
 */
export interface DisplayCategory {
  label: string;
  canonical: string;
  categories: string[];
}

export const EXPENSE_DISPLAY: DisplayCategory[] = [
  {
    label: "Necesidades",
    canonical: "servicios",
    categories: [
      "vivienda",
      "servicios_basicos",
      "servicios",
      "alimentacion",
      "transporte",
      "salud",
      "seguros",
      "educacion",
      "telecomunicaciones",
      "deudas",
    ],
  },
  {
    label: "Deseos",
    canonical: "otro",
    categories: [
      "restaurantes",
      "entretenimiento",
      "diversion",
      "hobbies",
      "suscripciones",
      "comercio",
      "cuidado_personal",
      "salud_bienestar",
      "regalos",
      "reparaciones",
      "imprevistos",
      "otro",
    ],
  },
  { label: "Ahorro", canonical: "ahorros", categories: ["ahorros", "inversiones"] },
  {
    label: "Transferencia",
    canonical: "transferencia_enviada",
    categories: ["transferencia_enviada"],
  },
  {
    // Traspaso entre cuentas propias: se excluye de ingresos/gastos reales.
    label: "Transferencia interna",
    canonical: "Transferencia interna",
    categories: ["Transferencia interna"],
  },
];

export const INCOME_DISPLAY: DisplayCategory[] = [
  {
    label: "Sueldo / Ingreso principal",
    canonical: "ingreso_principal",
    categories: ["ingreso_principal"],
  },
  { label: "Honorarios", canonical: "honorarios", categories: ["honorarios"] },
  {
    label: "Transferencias recibidas",
    canonical: "transferencia_recibida",
    categories: ["transferencia_recibida"],
  },
  {
    label: "Devoluciones y reintegros",
    canonical: "devoluciones",
    categories: ["devoluciones"],
  },
  { label: "Rentas e inversiones", canonical: "rentas", categories: ["rentas"] },
  { label: "Otros ingresos", canonical: "otros_ingresos", categories: ["otros_ingresos"] },
  {
    // Traspaso entre cuentas propias (p. ej. pago de la propia TC): excluido del ingreso.
    label: "Transferencia interna",
    canonical: "Transferencia interna",
    categories: ["Transferencia interna"],
  },
];

/** Opciones del selector según el tipo del movimiento. */
export function categoryOptionsForTipo(tipo: "ingreso" | "egreso"): DisplayCategory[] {
  return tipo === "ingreso" ? INCOME_DISPLAY : EXPENSE_DISPLAY;
}

const _labelByCatExpense = new Map<string, string>();
for (const d of EXPENSE_DISPLAY) for (const c of d.categories) _labelByCatExpense.set(c, d.label);
const _labelByCatIncome = new Map<string, string>();
for (const d of INCOME_DISPLAY) for (const c of d.categories) _labelByCatIncome.set(c, d.label);

/** Label a mostrar para una fila, según su categoría fina y su tipo. */
export function displayCategoryLabel(categoria: string, tipo: "ingreso" | "egreso"): string {
  const map = tipo === "ingreso" ? _labelByCatIncome : _labelByCatExpense;
  return map.get(categoria) ?? (tipo === "ingreso" ? "Otros ingresos" : "Deseos");
}

/** Color del chip por label de egreso; los ingresos comparten el verde. */
const EXPENSE_CHIP_COLORS: Record<string, string> = {
  Necesidades: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Deseos: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Ahorro: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  Transferencia: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};
const INCOME_CHIP = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";

export function displayCategoryColor(categoria: string, tipo: "ingreso" | "egreso"): string {
  if (tipo === "ingreso") return INCOME_CHIP;
  return (
    EXPENSE_CHIP_COLORS[displayCategoryLabel(categoria, "egreso")] ?? EXPENSE_CHIP_COLORS.Deseos
  );
}

/** Reverse index: raw parser category → group key */
const _reverseMap = new Map<string, CategoryGroupKey>();
for (const group of CATEGORY_TAXONOMY) {
  for (const cat of group.parserCategories) {
    _reverseMap.set(cat, group.key);
  }
}

/**
 * Resolve a raw parser category to its dashboard group.
 *
 * Income transactions (tipo=ingreso) that have expense-like categories
 * get routed to "ingresos" by the hook (not here). This function only
 * handles the category→group mapping.
 *
 * Unknown categories default to "personales" (imprevistos bucket).
 */
export function resolveGroupKey(rawCategory: string): CategoryGroupKey {
  return _reverseMap.get(rawCategory) ?? "personales";
}

/** Humanize a raw parser category string */
export function categoryLabel(rawCategory: string): string {
  for (const group of CATEGORY_TAXONOMY) {
    if (rawCategory in group.subcategoryLabels) {
      return group.subcategoryLabels[rawCategory];
    }
  }
  return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).replace(/_/g, " ");
}

/** Find taxonomy entry by group key */
export function getTaxonomyEntry(key: CategoryGroupKey) {
  return CATEGORY_TAXONOMY.find((t) => t.key === key)!;
}
