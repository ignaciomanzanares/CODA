/**
 * Single source of truth for public route SEO metadata.
 *
 * Consumed by:
 *  - src/components/SeoHelmet.tsx  (runtime, client-side)
 *  - scripts/prerender.mjs         (build-time, static HTML)
 *  - scripts/generate-sitemap.mjs  (build-time, sitemap.xml)
 */

import { FEATURES } from "@/config/features";

export const BASE_URL = "https://www.codafinance.cl";
export const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

export interface RouteSeoEntry {
  title: string;
  description: string;
  /** Canonical path (without origin). Defaults to same as route key. */
  canonicalPath?: string;
  /** If true, route is excluded from indexing and pre-rendering */
  noIndex?: boolean;
  /** Custom OG image URL (defaults to DEFAULT_OG_IMAGE) */
  ogImage?: string;
  /** Sitemap: changefreq */
  changefreq?: string;
  /** Sitemap: priority (0.0 – 1.0) */
  priority?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public routes — indexed, pre-rendered, included in sitemap
// ──────────────────────────────────────────────────────────────────────────────

const codaEmpresasRoutes: Record<string, RouteSeoEntry> = FEATURES.codaEmpresas
  ? {
      "/empresas": {
        title: "CODA Empresas | Gestión financiera empresarial",
        description:
          "Herramientas de gestión financiera, conciliación bancaria y análisis de riesgo para empresas chilenas.",
        changefreq: "monthly",
        priority: "0.5",
      },
    }
  : {};

export const PUBLIC_ROUTES: Record<string, RouteSeoEntry> = {
  ...codaEmpresasRoutes,
  "/": {
    title: "CODA | Salud financiera y score crediticio para Chile",
    description:
      "Diagnóstico automatizado con tus datos reales, score crediticio dual y recomendaciones de productos financieros. Gratis para personas en Chile.",
    changefreq: "weekly",
    priority: "1.0",
  },
  "/registro": {
    title: "Crear cuenta gratis | CODA",
    description:
      "Regístrate en CODA y obtén tu score crediticio y diagnóstico de salud financiera en minutos. 100% gratuito para personas.",
    changefreq: "monthly",
    priority: "0.9",
  },
  "/iniciar-sesion": {
    title: "Iniciar sesión | CODA",
    description:
      "Accede a tu panel CODA para ver tu score, gastos y recomendaciones financieras personalizadas.",
    changefreq: "monthly",
    priority: "0.7",
  },
  "/acerca": {
    title: "Sobre CODA | Chile Open-Data Analytics",
    description:
      "CODA es una plataforma chilena de salud financiera creada bajo el marco de la Ley Fintec 21.521. Conoce nuestro equipo y misión.",
    changefreq: "monthly",
    priority: "0.7",
  },
  "/productos": {
    title: "Productos Financieros | CODA",
    description:
      "Compara créditos, tarjetas, cuentas, depósitos a plazo y fondos mutuos. Ranking personalizado según tu perfil.",
    changefreq: "weekly",
    priority: "0.8",
  },
  "/info/score-credito": {
    title: "¿Qué es el score crediticio? | CODA",
    description:
      "Aprende cómo funciona el score crediticio en Chile, qué variables pesan y cómo mejorarlo con datos reales de CMF y tu banco.",
    changefreq: "monthly",
    priority: "0.8",
  },
  "/info/comparacion-productos": {
    title: "Comparar productos financieros en Chile | CODA",
    description:
      "Compara créditos de consumo, tarjetas y cuentas de ahorro de los principales bancos chilenos. Basado en datos CMF.",
    changefreq: "monthly",
    priority: "0.6",
  },
  "/info/metas-financieras": {
    title: "Metas financieras inteligentes | CODA",
    description:
      "Define y sigue metas financieras personalizadas. Ahorro, inversión, deuda: CODA te guía paso a paso.",
    changefreq: "monthly",
    priority: "0.6",
  },
  "/privacidad": {
    title: "Política de privacidad | CODA",
    description:
      "Cómo CODA protege tus datos financieros bajo la Ley 19.628 y la Ley Fintec 21.521.",
    changefreq: "monthly",
    priority: "0.4",
  },
  "/terminos": {
    title: "Términos y condiciones | CODA",
    description: "Términos de uso de la plataforma CODA Finance.",
    changefreq: "monthly",
    priority: "0.4",
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Alias routes — share canonical with primary route
// ──────────────────────────────────────────────────────────────────────────────

export const ALIAS_ROUTES: Record<string, RouteSeoEntry> = {
  "/signup": { ...PUBLIC_ROUTES["/registro"], canonicalPath: "/registro" },
  "/login": { ...PUBLIC_ROUTES["/iniciar-sesion"], canonicalPath: "/iniciar-sesion" },
  "/nosotros": { ...PUBLIC_ROUTES["/acerca"], canonicalPath: "/acerca" },
};

// ──────────────────────────────────────────────────────────────────────────────
// Private routes — noIndex, no pre-rendering
// ──────────────────────────────────────────────────────────────────────────────

export const PRIVATE_ROUTES: Record<string, RouteSeoEntry> = {
  "/restablecer-contrasena": { title: "Restablecer contraseña | CODA", description: "", noIndex: true },
  "/panel": { title: "Mi Panel | CODA", description: "", noIndex: true },
  "/gastos": { title: "Gastos | CODA", description: "", noIndex: true },
  "/movimientos": { title: "Movimientos | CODA", description: "", noIndex: true },
  "/productos/metricas": { title: "Métricas de Productos | CODA", description: "", noIndex: true },
  "/metas": { title: "Metas | CODA", description: "", noIndex: true },
  "/plan": { title: "Plan Financiero | CODA", description: "", noIndex: true },
  "/perfil": { title: "Perfil | CODA", description: "", noIndex: true },
  "/conexiones": { title: "Conexiones | CODA", description: "", noIndex: true },
  "/dividir-cuenta": { title: "Dividir Cuenta | CODA", description: "", noIndex: true },
  "/bienvenida": { title: "Bienvenida | CODA", description: "", noIndex: true },
  "/auditoria": { title: "Auditoría | CODA", description: "", noIndex: true },
  "/invitacion": { title: "Invitación | CODA", description: "", noIndex: true },
};
