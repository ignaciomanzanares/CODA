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
    parserCategories: ["ingreso_principal", "transferencia_recibida"],
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
 * Vista de 3 "grandes categorías" para el selector de categoría (Movimientos).
 * Sigue el modelo de nivel superior usado por las apps líderes (Mint, YNAB,
 * Monarch): Ingresos / Gastos / Transferencias. Dentro de "Gastos" el orden es
 * Necesidades → Deseos, alineado con el 50/30/20. El ahorro/inversión va con
 * transferencias: es dinero que se mueve/guarda, no que se consume.
 * Cubre TODAS las parserCategories del taxonomy (nada queda fuera del dropdown).
 */
export const CATEGORY_MEGA_GROUPS: {
  label: string;
  sections: { label?: string; categories: string[] }[];
}[] = [
  {
    label: "Ingresos",
    sections: [{ categories: ["ingreso_principal", "transferencia_recibida"] }],
  },
  {
    label: "Gastos",
    sections: [
      {
        label: "Necesidades",
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
    ],
  },
  {
    label: "Ahorro y transferencias",
    sections: [{ categories: ["ahorros", "inversiones", "transferencia_enviada"] }],
  },
];

/** Etiquetas de los 3 grandes buckets, en orden. */
export const MEGA_BUCKET_LABELS = CATEGORY_MEGA_GROUPS.map((b) => b.label);

/** Categoría canónica que se guarda al elegir un bucket en el selector simple. */
export const MEGA_BUCKET_CANONICAL: Record<string, string> = {
  Ingresos: "ingreso_principal",
  Gastos: "otro",
  "Ahorro y transferencias": "transferencia_enviada",
};

/** Color del chip por gran bucket (para el selector/etiqueta de Movimientos). */
export const MEGA_BUCKET_COLORS: Record<string, string> = {
  Ingresos: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Gastos: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "Ahorro y transferencias": "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

/** Reverse index: parserCategory → etiqueta de su gran bucket. */
const _bucketByCategory = new Map<string, string>();
for (const bucket of CATEGORY_MEGA_GROUPS) {
  for (const section of bucket.sections) {
    for (const c of section.categories) _bucketByCategory.set(c, bucket.label);
  }
}

/** Devuelve a cuál de los 3 grandes buckets pertenece una categoría fina. */
export function megaBucketForCategory(cat: string): string {
  return _bucketByCategory.get(cat) ?? "Gastos";
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
