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

import {
  Wallet,
  Home,
  User,
  Gamepad2,
  Landmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CategoryGroupKey } from "@/types/dashboard";

export interface CategoryTaxonomyEntry {
  key: CategoryGroupKey;
  label: string;
  icon: LucideIcon;
  color: "green" | "blue" | "purple" | "orange" | "red";
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
      "transferencia_recibida",
    ],
    subcategoryLabels: {
      ingreso_principal: "Sueldo / Ingreso principal",
      transferencia_recibida: "Transferencias recibidas",
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
      seguros: "Seguros",
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
    parserCategories: [
      "restaurantes",
      "entretenimiento",
      "diversion",
      "hobbies",
      "suscripciones",
    ],
    subcategoryLabels: {
      restaurantes: "Restaurantes y comida fuera",
      entretenimiento: "Entretenimiento",
      diversion: "Diversión",
      hobbies: "Hobbies",
      suscripciones: "Suscripciones",
    },
  },
  {
    key: "financieros",
    label: "Gastos Financieros",
    icon: Landmark,
    color: "red",
    chartColor: "#ef4444",
    parserCategories: [
      "transferencia_enviada",
      "deudas",
      "inversiones",
      "ahorros",
    ],
    subcategoryLabels: {
      transferencia_enviada: "Transferencias enviadas",
      deudas: "Pago de deudas",
      inversiones: "Aportes a inversiones",
      ahorros: "Aportes a ahorros",
    },
  },
];

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
