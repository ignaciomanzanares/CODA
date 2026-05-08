/**
 * SEO route data for build scripts (prerender, sitemap).
 *
 * IMPORTANT: This file MUST stay in sync with src/lib/seo-routes.ts.
 * The TypeScript file is the source of truth for the app runtime;
 * this file mirrors it for Node build scripts that can't import TS.
 *
 * If you add/change a public route, update BOTH files.
 */

export const BASE_URL = "https://www.codafinance.cl";
export const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

export const PUBLIC_ROUTES = {
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
      "Compara créditos, tarjetas, cuentas, depósitos a plazo, fondos mutuos, APV y más. Ranking personalizado según tu perfil.",
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
  "/info/riesgo-seguros": {
    title: "Evaluación de riesgo y seguros | CODA",
    description:
      "Conoce tu perfil de riesgo financiero y recomendaciones de seguros alineadas a tu situación real.",
    changefreq: "monthly",
    priority: "0.6",
  },
  "/metodologia": {
    title: "Metodología de scoring | CODA",
    description:
      "Conoce la metodología de scoring crediticio y transaccional de CODA, basada en estándares CMF NCG 502.",
    changefreq: "monthly",
    priority: "0.5",
  },
  "/instituciones": {
    title: "CODA para instituciones financieras",
    description:
      "Integraciones B2B para bancos, cooperativas y compañías de seguros. Diagnóstico financiero automatizado para tus clientes.",
    changefreq: "monthly",
    priority: "0.5",
  },
  "/empresas": {
    title: "CODA Empresas | Gestión financiera empresarial",
    description:
      "Herramientas de gestión financiera, conciliación bancaria y análisis de riesgo para empresas chilenas.",
    changefreq: "monthly",
    priority: "0.5",
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
