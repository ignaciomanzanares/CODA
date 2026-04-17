import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";

const BASE_URL = "https://www.codafinance.cl";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

interface RouteSeo {
  title: string;
  description: string;
  canonical: string;
  noIndex?: boolean;
  ogImage?: string;
}

/**
 * Per-route SEO metadata. Public pages get full SEO; authenticated pages
 * get noIndex so Google doesn't index private dashboards.
 */
const ROUTE_SEO: Record<string, RouteSeo> = {
  "/": {
    title: "CODA | Salud financiera y score crediticio para Chile",
    description:
      "Diagnóstico automatizado con tus datos reales, score crediticio dual y recomendaciones de productos financieros. Gratis para personas en Chile.",
    canonical: `${BASE_URL}/`,
  },
  "/registro": {
    title: "Crear cuenta gratis | CODA",
    description:
      "Regístrate en CODA y obtén tu score crediticio y diagnóstico de salud financiera en minutos. 100% gratuito para personas.",
    canonical: `${BASE_URL}/registro`,
  },
  "/signup": {
    title: "Crear cuenta gratis | CODA",
    description:
      "Regístrate en CODA y obtén tu score crediticio y diagnóstico de salud financiera en minutos. 100% gratuito para personas.",
    canonical: `${BASE_URL}/registro`,
  },
  "/iniciar-sesion": {
    title: "Iniciar sesión | CODA",
    description:
      "Accede a tu panel CODA para ver tu score, gastos y recomendaciones financieras personalizadas.",
    canonical: `${BASE_URL}/iniciar-sesion`,
  },
  "/login": {
    title: "Iniciar sesión | CODA",
    description:
      "Accede a tu panel CODA para ver tu score, gastos y recomendaciones financieras personalizadas.",
    canonical: `${BASE_URL}/iniciar-sesion`,
  },
  "/acerca": {
    title: "Sobre CODA | Chile Open-Data Analytics",
    description:
      "CODA es una plataforma chilena de salud financiera creada bajo el marco de la Ley Fintec 21.521. Conoce nuestro equipo y misión.",
    canonical: `${BASE_URL}/acerca`,
  },
  "/nosotros": {
    title: "Sobre CODA | Chile Open-Data Analytics",
    description:
      "CODA es una plataforma chilena de salud financiera creada bajo el marco de la Ley Fintec 21.521. Conoce nuestro equipo y misión.",
    canonical: `${BASE_URL}/acerca`,
  },
  "/info/score-credito": {
    title: "¿Qué es el score crediticio? | CODA",
    description:
      "Aprende cómo funciona el score crediticio en Chile, qué variables pesan y cómo mejorarlo con datos reales de CMF y tu banco.",
    canonical: `${BASE_URL}/info/score-credito`,
  },
  "/info/comparacion-productos": {
    title: "Comparar productos financieros en Chile | CODA",
    description:
      "Compara créditos de consumo, tarjetas y cuentas de ahorro de los principales bancos chilenos. Basado en datos CMF.",
    canonical: `${BASE_URL}/info/comparacion-productos`,
  },
  "/info/metas-financieras": {
    title: "Metas financieras inteligentes | CODA",
    description:
      "Define y sigue metas financieras personalizadas. Ahorro, inversión, deuda: CODA te guía paso a paso.",
    canonical: `${BASE_URL}/info/metas-financieras`,
  },
  "/info/riesgo-seguros": {
    title: "Evaluación de riesgo y seguros | CODA",
    description:
      "Conoce tu perfil de riesgo financiero y recomendaciones de seguros alineadas a tu situación real.",
    canonical: `${BASE_URL}/info/riesgo-seguros`,
  },
  "/privacidad": {
    title: "Política de privacidad | CODA",
    description:
      "Cómo CODA protege tus datos financieros bajo la Ley 19.628 y la Ley Fintec 21.521.",
    canonical: `${BASE_URL}/privacidad`,
  },
  "/terminos": {
    title: "Términos y condiciones | CODA",
    description: "Términos de uso de la plataforma CODA Finance.",
    canonical: `${BASE_URL}/terminos`,
  },
  "/metodologia": {
    title: "Metodología de scoring | CODA",
    description:
      "Conoce la metodología de scoring crediticio y transaccional de CODA, basada en estándares CMF NCG 502.",
    canonical: `${BASE_URL}/metodologia`,
  },
  "/instituciones": {
    title: "CODA para instituciones financieras",
    description:
      "Integraciones B2B para bancos, cooperativas y compañías de seguros. Diagnóstico financiero automatizado para tus clientes.",
    canonical: `${BASE_URL}/instituciones`,
  },
  "/empresas": {
    title: "CODA Empresas | Gestión financiera empresarial",
    description:
      "Herramientas de gestión financiera, conciliación bancaria y análisis de riesgo para empresas chilenas.",
    canonical: `${BASE_URL}/empresas`,
  },
  "/restablecer-contrasena": {
    title: "Restablecer contraseña | CODA",
    description: "Restablece tu contraseña para acceder a tu cuenta CODA.",
    canonical: `${BASE_URL}/restablecer-contrasena`,
    noIndex: true,
  },

  // Authenticated routes — noIndex
  "/panel": { title: "Mi Panel | CODA", description: "", canonical: "", noIndex: true },
  "/gastos": { title: "Gastos | CODA", description: "", canonical: "", noIndex: true },
  "/movimientos": { title: "Movimientos | CODA", description: "", canonical: "", noIndex: true },
  "/productos": { title: "Productos Financieros | CODA", description: "", canonical: "", noIndex: true },
  "/productos/metricas": { title: "Métricas de Productos | CODA", description: "", canonical: "", noIndex: true },
  "/metas": { title: "Metas | CODA", description: "", canonical: "", noIndex: true },
  "/plan": { title: "Plan Financiero | CODA", description: "", canonical: "", noIndex: true },
  "/perfil": { title: "Perfil | CODA", description: "", canonical: "", noIndex: true },
  "/conexiones": { title: "Conexiones | CODA", description: "", canonical: "", noIndex: true },
  "/dividir-cuenta": { title: "Dividir Cuenta | CODA", description: "", canonical: "", noIndex: true },
  "/bienvenida": { title: "Bienvenida | CODA", description: "", canonical: "", noIndex: true },
  "/auditoria": { title: "Auditoría | CODA", description: "", canonical: "", noIndex: true },
  "/invitacion": { title: "Invitación | CODA", description: "", canonical: "", noIndex: true },
};

/** Prefix-match for empresas/* authenticated routes */
function getRouteSeo(pathname: string): RouteSeo {
  const normalized = pathname.split("?")[0]?.replace(/\/$/, "") || "/";

  if (ROUTE_SEO[normalized]) return ROUTE_SEO[normalized];

  // Empresas sub-routes — all noIndex
  if (normalized.startsWith("/empresas/")) {
    return {
      title: "CODA Empresas",
      description: "",
      canonical: "",
      noIndex: true,
    };
  }

  // /dividir/:code public share pages
  if (normalized.startsWith("/dividir/")) {
    return {
      title: "Dividir Cuenta | CODA",
      description: "Te invitaron a dividir una cuenta. Revisa los detalles y paga tu parte.",
      canonical: `${BASE_URL}${normalized}`,
      noIndex: true,
    };
  }

  return {
    title: "CODA",
    description: "",
    canonical: "",
    noIndex: true,
  };
}

export default function SeoHelmet() {
  const [location] = useLocation();
  const seo = getRouteSeo(location);

  return (
    <Helmet>
      <title>{seo.title}</title>

      {seo.description && <meta name="description" content={seo.description} />}
      {seo.canonical && <link rel="canonical" href={seo.canonical} />}

      {seo.noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={seo.title} />
      {seo.description && <meta property="og:description" content={seo.description} />}
      {seo.canonical && <meta property="og:url" content={seo.canonical} />}
      <meta property="og:image" content={seo.ogImage || DEFAULT_OG_IMAGE} />
      <meta property="og:locale" content="es_CL" />
      <meta property="og:site_name" content="CODA" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      {seo.description && <meta name="twitter:description" content={seo.description} />}
      <meta name="twitter:image" content={seo.ogImage || DEFAULT_OG_IMAGE} />
    </Helmet>
  );
}
